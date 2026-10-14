import { expandOccurrences } from './projectionCalc';
import { isParcelaItem } from './despesas';
import { addMonths, todayStr } from './formatters';

/**
 * Compras parceladas ainda a pagar e quando cada uma termina — cópia fiel do motor do bot
 * (functions/lib/motor/parcelados.js); a paridade é testada.
 *  - Cartão: parcelas de faturas reais não pagas (inclusive vencidas) + parcelas projetadas dos meses seguintes
 *    (uma fatura paga continua projetando as parcelas futuras: o filtro de "conferido" vale por ocorrência).
 *  - Avulsos (frequencia 'parcelado'): parcelas de hoje em diante ainda não pagas.
 * As datas são as do CAIXA (quando a parcela sai da conta: vencimento da fatura).
 */
export function calcParcelados(txs, today = todayStr()) {
  const horizonte = addMonths(today, 48);
  const lista = txs || [];

  // ── Cartão ────────────────────────────────────────────────────────────────
  const parcelas = new Map();
  const ocorrencias = lista.filter(t => t.tipo === 'cartao').flatMap(t => expandOccurrences(t, '2000-01-01', horizonte));
  for (const o of ocorrencias) {
    const projetada = String(o.tx.id || '').includes('-proj-');
    if (!projetada && o.tx.conferido) continue;
    for (const item of (o.tx.itens || [])) {
      if (!isParcelaItem(item) || !item.totalParcelas) continue;
      const k = item.parcelaAtual || 1;
      if (k > item.totalParcelas) continue;
      const desc = String(item.descricao || '').trim().toLowerCase();
      const chave = `${o.tx.cartaoId}|${desc}|${item.dataCompra || ''}|${item.totalParcelas}|${k}`;
      const atual = parcelas.get(chave);
      if (atual && (atual.real || projetada)) continue;
      parcelas.set(chave, {
        cartaoId: o.tx.cartaoId, descricao: item.descricao || o.tx.descricao || 'Item',
        grupo: `${o.tx.cartaoId}|${desc}|${item.totalParcelas}`,
        valor: Number(item.valor) || 0, k, totalParcelas: item.totalParcelas, real: !projetada,
        data: o.date,
      });
    }
  }
  const grupos = new Map();
  for (const p of parcelas.values()) {
    const g = grupos.get(p.grupo) || { cartaoId: p.cartaoId, descricao: p.descricao, totalParcelas: p.totalParcelas, lista: [] };
    g.lista.push(p);
    grupos.set(p.grupo, g);
  }
  const cartaoItems = [...grupos.values()].map(g => {
    g.lista.sort((x, y) => x.k - y.k);
    return {
      cartaoId: g.cartaoId, descricao: g.descricao, totalParcelas: g.totalParcelas,
      parcelaAtual: g.lista[0].k, valor: g.lista[0].valor,
      restam: g.lista.length, totalRestante: g.lista.reduce((acc, p) => acc + p.valor, 0),
      ultimaData: g.lista.reduce((a, p) => (p.data > a ? p.data : a), g.lista[0].data),
    };
  });

  // ── Avulsos ───────────────────────────────────────────────────────────────
  const avulsos = [];
  for (const t of lista.filter(x => x.frequencia === 'parcelado' && x.tipo !== 'cartao')) {
    if (t.conferido) continue;
    const pagas = Array.isArray(t.conferidos) ? t.conferidos : [];
    const futuras = expandOccurrences(t, today, horizonte).filter(o => o.date >= today && !pagas.includes(o.date));
    if (futuras.length === 0) continue;
    const total = t.totalParcelas || 1;
    avulsos.push({
      descricao: t.descricao || 'Parcelado', valor: Number(t.valor) || 0, totalParcelas: total,
      parcelaAtual: Math.max(1, total - futuras.length + 1),
      restam: futuras.length, totalRestante: futuras.reduce((acc, o) => acc + o.valor, 0),
      ultimaData: futuras.reduce((a, o) => (o.date > a ? o.date : a), futuras[0].date),
    });
  }
  return { cartaoItems, avulsos };
}

const arred = (n) => Math.round(n * 100) / 100;

/**
 * Quando cada compra termina e quanto o orçamento libera: agrupa os itens pelo mês da ÚLTIMA parcela.
 * `livreAPartirDe` é o mês seguinte ao da última parcela de todas. Só vale se não houver novas compras parceladas.
 */
export function cronogramaParcelas({ cartaoItems, avulsos }) {
  const itens = [...cartaoItems, ...avulsos].filter(i => i.ultimaData);
  if (itens.length === 0) return { mensalHoje: 0, liberacoes: [], ultimaParcela: null, livreAPartirDe: null };

  const porMes = new Map();
  for (const i of itens) {
    const mes = i.ultimaData.slice(0, 7);
    (porMes.get(mes) || porMes.set(mes, []).get(mes)).push(i);
  }
  const liberacoes = [...porMes.keys()].sort().map(mes => {
    const grupo = porMes.get(mes).sort((a, b) => b.valor - a.valor || a.descricao.localeCompare(b.descricao));
    return { mes, itens: grupo.map(i => i.descricao), libera: arred(grupo.reduce((s, i) => s + i.valor, 0)) };
  });
  const ultimaParcela = liberacoes.at(-1).mes;
  return {
    mensalHoje: arred(itens.reduce((s, i) => s + i.valor, 0)),
    liberacoes,
    ultimaParcela,
    livreAPartirDe: addMonths(`${ultimaParcela}-01`, 1).slice(0, 7),
  };
}
