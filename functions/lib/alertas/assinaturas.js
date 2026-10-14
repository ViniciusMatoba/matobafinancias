'use strict';

const { detectarAssinaturasBot } = require('../motor/assinaturas');
const { formatBRL, mdEscape } = require('../util/formato');

/**
 * N26 — aviso de assinaturas: reajuste de valor e assinatura nova. Nasce DESLIGADO (só roda com n26 === true).
 *
 * Regras (sem estado próprio — cada mudança avisa uma vez pela memória de avisos, via `estado`):
 *  - Reajuste: o item é assinatura com pelo menos 3 meses de histórico (2 no valor antigo) e a mudança de valor
 *    aconteceu neste mês ou no mês anterior. Aviso para mais e para menos.
 *  - Assinatura nova: o item aparece neste mês e no anterior e antes disso não existia, mas só se a pessoa já tem
 *    pelo menos 4 meses de compras no cartão (senão, no começo do uso, tudo pareceria "novo").
 *  - Item com a tag "Assinaturas" avisa já na primeira aparição, mesmo sem histórico.
 */
const MIN_HISTORICO_PARA_NOVA = 4;

function alertasAssinaturasBot({ transactions, config, hoje }) {
  const r = detectarAssinaturasBot({
    transactions,
    tags: Array.isArray(config?.tags) ? config.tags : [],
    ignoradas: config?.assinaturasIgnoradas,
    hoje,
  });
  const { mesAtual, mesAnterior, historicoMeses } = r.contexto;
  const recentes = new Set([mesAtual, mesAnterior]);
  const msgs = [];

  for (const a of r.assinaturas) {
    const nome = mdEscape(a.nome);
    const chave = `assin:${a.chave}`;

    // Reajuste de valor
    if (a.ultimoReajuste && a.meses >= 3 && recentes.has(a.ultimoReajuste.mes)) {
      const { de, para } = a.ultimoReajuste;
      const pct = Math.round(((para - de) / de) * 100);
      const subiu = para > de;
      const anual = Math.abs(para - de) * 12;
      msgs.push({
        text: subiu
          ? `🔺 *Reajuste: ${nome}*\nPassou de ${formatBRL(de)} para *${formatBRL(para)}* por mês (+${pct}%) — ${formatBRL(anual)} a mais por ano.`
          : `🔻 *Baixou: ${nome}*\nPassou de ${formatBRL(de)} para *${formatBRL(para)}* por mês (${pct}%) — ${formatBRL(anual)} a menos por ano.`,
        estado: { chave, sig: `r:${para}` },
      });
      continue;
    }

    // Assinatura nova (aparece em 2 meses seguidos, depois de um histórico) ou marcada com a tag na 1ª vez
    const novaPorRepeticao = a.meses === 2 && !a.marcada && historicoMeses >= MIN_HISTORICO_PARA_NOVA;
    const novaPorTag = a.marcada && a.meses <= 2;
    if (novaPorRepeticao || novaPorTag) {
      msgs.push({
        text: `🆕 *Nova assinatura${novaPorTag ? ' (tag Assinaturas)' : ' detectada'}: ${nome}*\n` +
          `${formatBRL(a.valorAtual)} por mês (${formatBRL(a.valorAtual * 12)} por ano).\n` +
          `_Se não for uma assinatura, oculte no app: Painel → Assinaturas._`,
        estado: { chave, sig: `n:${a.valorAtual}` },
      });
    }
  }
  return msgs;
}

module.exports = { MIN_HISTORICO_PARA_NOVA, alertasAssinaturasBot };
