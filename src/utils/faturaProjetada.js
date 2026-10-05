import { addMonths } from './formatters';
import { isParcelaItem } from './despesas';

/**
 * Faturas de cartão projetadas e duplicidades.
 *
 * Uma fatura única com parcelas projeta sozinha as parcelas dos meses seguintes. Quando uma dessas
 * projeções vira lançamento real (pagar, editar), o lançamento NOVO não pode projetar de novo — quem
 * segue projetando é o lançamento de origem. Por isso os itens do lançamento real vão como "não parcelados"
 * (os campos parcelaAtual/totalParcelas continuam nos itens, então a parcela segue reconhecível).
 */

const norm = (s) => String(s || '')
  .toLowerCase().trim()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ');

/** Itens de uma fatura projetada que passa a ser lançamento real: sem projeção própria. */
export const itensDoLancamentoReal = (itens) => (itens || []).map(i => ({ ...i, isParcelado: false }));

/** Lançamento gravado ao pagar uma fatura projetada (a projeção paga é excluída do original). */
export function docPagamentoFaturaProjetada(tx, { paymentDate, valor }) {
  return {
    tipo: 'cartao',
    frequencia: 'unico',
    descricao: tx.descricao ? `Pagamento Fatura – ${tx.descricao}` : 'Pagamento de Fatura',
    valor,
    dataInicio: paymentDate,
    categoria: null,
    dataFim: null,
    itens: itensDoLancamentoReal(tx.itens),
    cartaoId: tx.cartaoId || null,
    conferido: true,
  };
}

const ehPagamentoDeFatura = (tx) => /^pagamento (de )?fatura/.test(norm(tx.descricao));

/**
 * Cada parcela de cada plano, na data em que o CAIXA a conta — espelha expandOccurrences:
 * a parcela do próprio lançamento e, se o item é parcelado, as seguintes (menos as excluídas / após dataFim).
 */
export function planosDeParcelas(transactions) {
  const entradas = [];
  for (const tx of transactions || []) {
    if (!tx || tx.tipo !== 'cartao' || tx.frequencia !== 'unico' || !Array.isArray(tx.itens)) continue;
    const venc = tx.dataInicio;
    const exclusoes = Array.isArray(tx.exclusoes) ? tx.exclusoes : [];

    tx.itens.forEach(item => {
      if (!isParcelaItem(item)) return;
      const valor = Number(item.valor) || 0;
      if (!valor) return;
      const total = Number(item.totalParcelas) || 1;
      const k = Math.max(1, Number(item.parcelaAtual) || 1);
      const origem = item.dataCompra || addMonths(venc, -(k - 1));
      const chave = (j) => `${tx.cartaoId || ''}|${norm(item.descricao)}|${origem}|${total}|${j}`;
      const base = { docId: tx.id, docDescricao: tx.descricao || 'Fatura', descricao: item.descricao || 'Item', total, valor };

      if (!exclusoes.includes(venc)) entradas.push({ ...base, key: chave(k), j: k, data: venc, projetada: false });
      if (!item.isParcelado) return;
      for (let j = k + 1; j <= total; j++) {
        const data = addMonths(venc, j - k);
        if (exclusoes.includes(data)) continue;
        if (tx.dataFim && data > tx.dataFim) continue;
        entradas.push({ ...base, key: chave(j), j, data, projetada: true });
      }
    });
  }
  return entradas;
}

/**
 * Procura duplicidades de fatura:
 *  - parcelasEmDobro: a mesma parcela de uma compra aparece em mais de um lançamento/projeção (o caixa soma todas)
 *  - pagamentosRedundantes: "Pagamento Fatura" que projeta parcelas que o lançamento de origem já projeta (seguro corrigir)
 *  - faturasRepetidas: dois lançamentos de fatura idênticos (cartão, data, valor e descrição) — possível lançamento em duplicidade
 */
export function encontrarDuplicidades(transactions) {
  const entradas = planosDeParcelas(transactions);
  const porChave = new Map();
  for (const e of entradas) {
    if (!porChave.has(e.key)) porChave.set(e.key, []);
    porChave.get(e.key).push(e);
  }

  const parcelasEmDobro = [];
  for (const lista of porChave.values()) {
    if (lista.length < 2) continue;
    const maior = Math.max(...lista.map(e => e.valor));
    parcelasEmDobro.push({
      descricao: lista[0].descricao,
      parcela: `${lista[0].j}/${lista[0].total}`,
      excedente: lista.reduce((s, e) => s + e.valor, 0) - maior,
      ocorrencias: lista.map(e => ({ docId: e.docId, docDescricao: e.docDescricao, data: e.data, projetada: e.projetada })),
    });
  }
  parcelasEmDobro.sort((a, b) => a.ocorrencias[0].data.localeCompare(b.ocorrencias[0].data));

  // Pagamento só é "redundante" se TODAS as parcelas que ele projeta já existem em outro lançamento
  const pagamentosRedundantes = [];
  for (const tx of transactions || []) {
    if (!tx || tx.tipo !== 'cartao' || !ehPagamentoDeFatura(tx)) continue;
    const projetadas = entradas.filter(e => e.docId === tx.id && e.projetada);
    if (projetadas.length === 0) continue;
    const todasCobertas = projetadas.every(e => porChave.get(e.key).some(o => o.docId !== tx.id));
    if (todasCobertas) pagamentosRedundantes.push(tx);
  }

  const repetidas = new Map();
  for (const tx of transactions || []) {
    if (!tx || tx.tipo !== 'cartao' || tx.frequencia !== 'unico') continue;
    const k = `${tx.cartaoId || ''}|${tx.dataInicio}|${Number(tx.valor) || 0}|${norm(tx.descricao)}`;
    if (!repetidas.has(k)) repetidas.set(k, []);
    repetidas.get(k).push(tx);
  }
  const faturasRepetidas = [...repetidas.values()]
    .filter(l => l.length > 1)
    .map(l => ({ descricao: l[0].descricao || 'Fatura', data: l[0].dataInicio, valor: Number(l[0].valor) || 0, docIds: l.map(t => t.id) }));

  return { parcelasEmDobro, pagamentosRedundantes, faturasRepetidas };
}

/** Gravações que tiram a projeção própria dos pagamentos redundantes (o lançamento de origem segue projetando). */
export function correcaoPagamentosRedundantes(pagamentosRedundantes) {
  return (pagamentosRedundantes || []).map(tx => ({ id: tx.id, data: { itens: itensDoLancamentoReal(tx.itens) } }));
}
