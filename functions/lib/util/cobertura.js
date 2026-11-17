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

/**
 * Linhas "Saldo Global" para o topo de /saldo e do resumo diário: nunca mostra a conta com sinal de menos (conta abaixo de
 * zero é um resgate necessário) e, com dinheiro investido, acrescenta "Investido · Total (conta + investido)".
 * `rotulo` = "Saldo Global" ou "Saldo atual".
 */
function linhasSaldoConta({ saldo, investido, rotulo = 'Saldo Global', marca = true }) {
  const inv = Math.max(Number(investido) || 0, 0);
  const ok = saldo >= 0;
  let t = ok
    ? `💰 *${rotulo}:* ${formatBRL(saldo)}${marca ? ' ✅' : ''}`
    : `💰 *${rotulo}:* a conta precisa de *${formatBRL(-saldo)}*${marca ? ' ⚠️' : ''}\n${fraseCobertura({ precisa: -saldo, guardado: inv })}`;
  if (inv > 0 && saldo + inv >= 0) t += `\n🏦 Investido: *${formatBRL(inv)}* · Total (conta + investido): *${formatBRL(saldo + inv)}*`;
  return t;
}

/**
 * Resumo de um período (dia ou semana) sem "saldo negativo falso": aporte e resgate só movem dinheiro entre a conta e o
 * investimento, então ficam em linhas próprias; o resultado do período é entradas − saídas (o que muda de verdade o seu
 * dinheiro) e o "Movimento na conta" (com aporte e resgate) só aparece quando houve um dos dois.
 * `periodo`: 'dia' | 'semana'. `sempre`: mostra Entradas e Saídas mesmo zeradas.
 */
function textoResumoPeriodo({ entradas, saidas, investido = 0, resgatado = 0, periodo = 'dia', sempre = false }) {
  const l = [];
  if (sempre || entradas > 0) l.push(`✅ Entradas: *${formatBRL(entradas)}*`);
  if (sempre || saidas > 0) l.push(`❌ Saídas:   *${formatBRL(saidas)}*`);
  if (investido > 0) l.push(`💰 Investido: *${formatBRL(investido)}* (sai da conta, continua seu)`);
  if (resgatado > 0) l.push(`↩️ Resgatado: *${formatBRL(resgatado)}* (volta do investimento para a conta)`);
  const total = entradas - saidas;
  const nome = periodo === 'semana' ? { ok: 'Resultado da semana', neg: 'Na semana, o total' } : { ok: 'Resultado do dia', neg: 'No dia, o total' };
  l.push(total >= 0
    ? `🏦 ${nome.ok} (conta + investido): *${formatBRL(total)}*`
    : `🏦 ${nome.neg} (conta + investido) diminui *${formatBRL(-total)}*`);
  if (investido > 0 || resgatado > 0) {
    const conta = entradas - saidas - investido + resgatado;
    l.push(conta >= 0 ? `🏧 Movimento na conta: entra *${formatBRL(conta)}*` : `🏧 Movimento na conta: saem *${formatBRL(-conta)}*`);
  }
  return l.join('\n');
}

module.exports = { fraseCobertura, linhasSaldoConta, textoResumoPeriodo };
