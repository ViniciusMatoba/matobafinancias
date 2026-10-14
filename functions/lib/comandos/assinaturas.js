'use strict';

const { db } = require('../infra/firebase');
const { loadUserData } = require('../infra/dados');
const { sendMessage } = require('../infra/telegram');
const { detectarAssinaturasBot } = require('../motor/assinaturas');
const { formatBRL, mdEscape } = require('../util/formato');
const { sendChunked } = require('./gastos');

const mesAno = (iso) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

// /assinaturas — o que cai todo mês: assinaturas no cartão, recorrentes de Pix/débito e totais
async function handleAssinaturas(chatId, uid) {
  const [{ transactions }, cfgDoc] = await Promise.all([
    loadUserData(uid),
    db.collection('config').doc(uid).get(),
  ]);
  const config = cfgDoc.exists ? cfgDoc.data() : {};
  const r = detectarAssinaturasBot({
    transactions,
    tags: Array.isArray(config.tags) ? config.tags : [],
    ignoradas: config.assinaturasIgnoradas,
  });

  if (!r.assinaturas.length && !r.recorrentesComuns.length && !r.variaveis.length) {
    return sendMessage(chatId,
      `🔁 *Assinaturas e recorrentes*\n\nNada recorrente encontrado ainda. Quando um item de cartão se repetir em meses seguidos ele aparece aqui.\n\n` +
      `_Dica: use a tag *Assinaturas* para marcar o que você já sabe que é assinatura._`);
  }

  const linhas = [];
  if (r.assinaturas.length) {
    linhas.push(`💳 *No cartão* — ${formatBRL(r.totais.mensalCartao)}/mês · ${formatBRL(r.totais.anualCartao)}/ano`);
    for (const a of r.assinaturas) {
      const reaj = a.ultimoReajuste
        ? ` ${a.ultimoReajuste.para > a.ultimoReajuste.de ? '▲' : '▼'} _(era ${formatBRL(a.ultimoReajuste.de)})_`
        : '';
      linhas.push(`• ${mdEscape(a.nome)}${a.marcada ? ' 🏷' : ''} — *${formatBRL(a.valorAtual)}*${reaj} _desde ${mesAno(a.desde)}_`);
    }
    linhas.push('');
  }
  if (r.recorrentesComuns.length) {
    linhas.push(`🏦 *Pix/débito* — ${formatBRL(r.totais.comunsMensal)}/mês`);
    for (const c of r.recorrentesComuns) {
      const quando = c.frequencia === 'semanal' ? 'toda semana' : `dia ${c.dia}`;
      linhas.push(`• ${mdEscape(c.nome)} — *${formatBRL(c.valorMensal)}* _(${quando})_`);
    }
    linhas.push('');
  }
  linhas.push(`📊 *Total fixo por mês:* ${formatBRL(r.totais.geralMensal)} _(${formatBRL(r.totais.geralAnual)} por ano)_`);
  if (r.variaveis.length) {
    linhas.push(`\n_Repetem todo mês mas o valor varia (${r.variaveis.length} ${r.variaveis.length > 1 ? 'itens' : 'item'}, média de ${formatBRL(r.totais.variaveisMensal)}/mês) — não entram no total._`);
  }
  linhas.push(`_Para ocultar algo que não é assinatura: app → Painel → Assinaturas._`);

  return sendChunked(chatId, `🔁 *Assinaturas e recorrentes*\n\n`, linhas);
}

module.exports = { handleAssinaturas };
