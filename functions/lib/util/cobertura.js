'use strict';

const { formatBRL } = require('./formato');

/**
 * Frase de cobertura para avisos de "a conta vai precisar de dinheiro": diz se o investido cobre (resgate) ou quanto
 * falta. Nunca mostra valor com sinal de menos — o buraco da conta é um resgate necessário, não um saldo negativo.
 * `guardado` = total investido (a reserva já faz parte dele).
 */
function fraseCobertura({ precisa, guardado }) {
  const g = Math.max(Number(guardado) || 0, 0);
  if (g >= precisa) return `🛡️ _O que você tem investido (${formatBRL(g)}) cobre esse valor — resgate só o necessário._`;
  if (g > 0) return `⛔ _Mesmo resgatando tudo o que está investido (${formatBRL(g)}) faltam ${formatBRL(precisa - g)}._`;
  return '⛔ _Não há valor investido para cobrir._';
}

module.exports = { fraseCobertura };
