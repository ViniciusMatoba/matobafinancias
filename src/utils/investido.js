import { expandOccurrences } from './projectionCalc';

/**
 * Resgate = dinheiro que volta do investimento para a conta. É gravado como ENTRADA com `resgate: true`
 * (e `metaId` quando sai de uma caixinha): no caixa conta como entrada (+), na competência não é gasto,
 * e nos totais de investido e no saldo da caixinha SUBTRAI. Nos resumos de receita não deve aparecer.
 */
export const ehResgate = (tx) => !!tx && tx.tipo === 'entrada' && tx.resgate === true;

/** Sinal de um lançamento ligado a uma caixinha: saída e resgate tiram, o resto (aporte, entrada) soma. */
export const sinalNaCaixinha = (tx) => (tx.tipo === 'saida' || ehResgate(tx) ? -1 : 1);

/**
 * Lançamentos de um resgate de `valor` na `data`. Sai primeiro da caixinha de reserva (resgate imediato, ligada por
 * `metaId`) até o que ela tem disponível; o restante vem do investimento geral (sem caixinha). Datas até hoje já nascem
 * conferidas (o dinheiro já voltou); futuras ficam pendentes.
 */
export function docsResgate({ valor, data, hoje, reservaDisponivel = 0, reservaGoalId = null }) {
  const total = Math.round((Number(valor) || 0) * 100) / 100;
  if (!(total > 0)) return [];
  const daReserva = reservaGoalId ? Math.min(total, Math.round(Math.max(reservaDisponivel, 0) * 100) / 100) : 0;
  const base = { tipo: 'entrada', resgate: true, frequencia: 'unico', dataInicio: data, categoria: null, dataFim: null, conferido: data <= hoje };
  const docs = [];
  if (daReserva > 0) docs.push({ ...base, valor: daReserva, descricao: 'Resgate da reserva', metaId: reservaGoalId });
  const resto = Math.round((total - daReserva) * 100) / 100;
  if (resto > 0) docs.push({ ...base, valor: resto, descricao: 'Resgate de investimento' });
  return docs;
}

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
