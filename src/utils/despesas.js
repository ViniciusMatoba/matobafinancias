import { expandOccurrences } from './projectionCalc';
import { addMonths } from './formatters';

/**
 * Despesas por COMPETÊNCIA: o gasto conta quando aconteceu, não quando a fatura é paga.
 *  - compra à vista no cartão  → data da compra (item.dataCompra)
 *  - compra parcelada          → parcela k na data da compra + (k-1) meses
 *  - demais despesas           → data da própria ocorrência
 *
 * Isto é só leitura para categorias, tags e relatórios. O caixa (saldo, projeção, faturas e
 * vencimentos) continua sendo calculado por expandOccurrences/calcSaldo/buildDailyProjection,
 * que esta função apenas consulta e nunca altera.
 */

const normDesc = (s) => String(s || '')
  .toLowerCase().trim()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ');

/** Item que é uma parcela: marcado como parcelado, ou convertido (isParcelado:false) mas com parcela/total. */
export function isParcelaItem(item) {
  return !!item?.isParcelado || (Number(item?.totalParcelas) > 1 && Number(item?.parcelaAtual) >= 1);
}

/**
 * Eventos de despesa com data em [from, to], ordenados por data.
 * Evento: { date, valor, categoria, tag, descricao, tipo, tx, parcela, projetada, itemIndex? }
 * `categoria` é null quando não há (quem consome decide: 'outros' / 'sem categoria').
 */
export function expandDespesas(transactions, from, to, { historical = false } = {}) {
  const eventos = [];
  const planos = new Map(); // parcela de um plano -> evento (real vence projetado, conta uma vez só)

  const guardaPlano = (key, ev, real) => {
    const atual = planos.get(key);
    if (!atual || (real && !atual.real)) planos.set(key, { ev, real });
  };

  const faturaUnica = (tx) => {
    const venc = tx.dataInicio;
    const faturaExcluida = !!tx.exclusoes?.includes(venc);

    tx.itens.forEach((item, itemIndex) => {
      const valor = Number(item.valor) || 0;
      if (!valor) return;
      const comum = {
        valor,
        categoria: item.categoria || null,
        tag: item.tag || null,
        descricao: item.descricao || tx.descricao || 'Item de cartão',
        tipo: 'cartao',
        tx,
        itemIndex,
      };

      if (!isParcelaItem(item)) {
        if (faturaExcluida) return;
        const date = item.dataCompra || venc;
        if (date >= from && date <= to) eventos.push({ ...comum, date, parcela: null, projetada: false });
        return;
      }

      const total = Number(item.totalParcelas) || 1;
      const k = Math.max(1, Number(item.parcelaAtual) || 1);
      const origem = item.dataCompra || addMonths(venc, -(k - 1));
      // Só itens marcados como parcelados projetam as parcelas seguintes (igual ao caixa).
      // Os convertidos contam apenas a parcela do próprio mês; o resto vem do lançamento de origem.
      const projeta = !!item.isParcelado;
      const ultima = projeta ? total : k;

      for (let j = k; j <= ultima; j++) {
        const date = addMonths(origem, j - 1);
        if (date > to) break;
        const dataCaixa = addMonths(venc, j - k); // data em que o caixa projeta esta parcela
        const excluida = j === k ? faturaExcluida : (!!tx.exclusoes?.includes(dataCaixa) || !!(tx.dataFim && dataCaixa > tx.dataFim));
        if (excluida) continue;
        const chave = `${tx.cartaoId || ''}|${normDesc(item.descricao)}|${origem}|${total}|${j}`;
        guardaPlano(chave, { ...comum, date, parcela: `${j}/${total}`, projetada: j !== k }, j === k);
      }
    });
  };

  for (const tx of transactions || []) {
    if (!tx || tx.tipo === 'entrada') continue;

    const itens = tx.tipo === 'cartao' && Array.isArray(tx.itens) && tx.itens.length > 0 ? tx.itens : null;
    if (itens && tx.frequencia === 'unico') {
      faturaUnica(tx);
      continue;
    }

    // Demais despesas e faturas recorrentes: cada ocorrência vale na própria data
    for (const o of expandOccurrences(tx, from, to, { historical })) {
      if (itens) {
        itens.forEach((item, itemIndex) => {
          const valor = Number(item.valor) || 0;
          if (!valor) return;
          eventos.push({
            date: o.date, valor, categoria: item.categoria || null, tag: item.tag || null,
            descricao: item.descricao || tx.descricao || 'Item de cartão',
            tipo: 'cartao', tx, parcela: null, projetada: false, itemIndex,
          });
        });
      } else {
        eventos.push({
          date: o.date,
          valor: o.valor,
          categoria: tx.categoria || (tx.tipo === 'investimento' ? 'liberdade' : null),
          tag: tx.tag || null,
          descricao: tx.descricao || tx.tipo,
          tipo: tx.tipo,
          tx,
          parcela: o.parcela ? `${o.parcela}/${o.totalParcelas}` : null,
          projetada: false,
        });
      }
    }
  }

  for (const { ev } of planos.values()) {
    if (ev.date >= from && ev.date <= to) eventos.push(ev);
  }

  return eventos.sort((a, b) => a.date.localeCompare(b.date) || b.valor - a.valor);
}

/** Total de despesas por categoria ('outros' quando não há). */
export function totaisPorCategoria(eventos) {
  const totais = {};
  for (const e of eventos) {
    const cat = e.categoria || 'outros';
    totais[cat] = (totais[cat] || 0) + e.valor;
  }
  return totais;
}
