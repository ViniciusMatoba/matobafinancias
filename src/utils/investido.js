import { expandOccurrences } from './projectionCalc';

/**
 * Resgate = dinheiro que volta do investimento para a conta. É gravado como ENTRADA com `resgate: true`
 * (e `metaId` quando sai de uma caixinha): no caixa conta como entrada (+), na competência não é gasto,
 * e nos totais de investido e no saldo da caixinha SUBTRAI. Nos resumos de receita não deve aparecer.
 */
export const ehResgate = (tx) => !!tx && tx.tipo === 'entrada' && tx.resgate === true;

/** Sinal de um lançamento ligado a uma caixinha: saída e resgate tiram, o resto (aporte, entrada) soma. */
export const sinalNaCaixinha = (tx) => (tx.tipo === 'saida' || ehResgate(tx) ? -1 : 1);

const FAR_PAST = '2020-01-01';

/** Total investido até a data (inclusive): aportes − resgates, pelas ocorrências de cada lançamento. */
export function totalInvestidoAte(transactions, ate) {
  let total = 0;
  for (const t of transactions || []) {
    const sinal = t.tipo === 'investimento' ? 1 : ehResgate(t) ? -1 : 0;
    if (!sinal) continue;
    for (const o of expandOccurrences(t, FAR_PAST, ate)) total += sinal * (Number(o.valor) || 0);
  }
  return total;
}
