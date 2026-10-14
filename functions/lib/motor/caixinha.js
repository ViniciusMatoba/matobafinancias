'use strict';

/**
 * Saldo de uma caixinha — mesma regra da tela Metas do app e do /meta: lançamentos ligados por `metaId`
 * (o aporte pelo app é gravado assim); saída subtrai, o resto soma; cada lançamento conta uma vez.
 * Espelha src/utils/caixinha.js (a paridade é testada).
 */
function saldoCaixinhaBot(transactions, goalId) {
  if (!goalId) return 0;
  return (transactions || [])
    .filter(t => t.metaId === goalId)
    .reduce((acc, t) => {
      const valor = Number(t.valor) || 0;
      return t.tipo === 'saida' ? acc - valor : acc + valor;
    }, 0);
}

/** Reserva de emergência: saldo da caixinha escolhida, nunca negativo (0 se a caixinha não existe). */
function reservaDaCaixinhaBot(transactions, goals, goalId) {
  if (!goalId || !(goals || []).some(g => g.id === goalId)) return 0;
  return Math.max(saldoCaixinhaBot(transactions, goalId), 0);
}

module.exports = { saldoCaixinhaBot, reservaDaCaixinhaBot };
