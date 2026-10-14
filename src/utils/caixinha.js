/**
 * Saldo de uma caixinha (meta). Mesma regra da tela Metas e do comando /meta do bot:
 * soma o valor dos lançamentos ligados à meta por `metaId` — saída subtrai, qualquer outro tipo
 * (investimento, entrada) soma. Cada lançamento conta uma vez, com o valor do próprio lançamento.
 *
 * O aporte pelo app é gravado com `metaId`; foi isso que a reserva de emergência ignorava (procurava
 * goalId/cartaoVinculo, campos que o app nunca grava).
 */
export function saldoCaixinha(transactions, goalId) {
  if (!goalId) return 0;
  return (transactions || [])
    .filter(t => t.metaId === goalId)
    .reduce((acc, t) => {
      const valor = Number(t.valor) || 0;
      return t.tipo === 'saida' ? acc - valor : acc + valor;
    }, 0);
}

/** Valor da reserva de emergência: o saldo da caixinha escolhida, nunca negativo. */
export function reservaDaCaixinha(transactions, goals, goalId) {
  if (!goalId || !(goals || []).some(g => g.id === goalId)) return 0;
  return Math.max(saldoCaixinha(transactions, goalId), 0);
}
