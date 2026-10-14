'use strict';

const { logger } = require('firebase-functions');
const { handleConfirmPendingTx, handleIgnorePendingTx } = require('./despesaPendente');
const { handlePayCallback, handlePayCardCallback, handlePostponeCallback } = require('./pagar');
const { DEFAULT_TG_TIPOS, buildConfigKeyboard, buildConfigText, getTelegramTipos, saveTelegramTipos } = require('../comandos/configurar');
const { db } = require('../infra/firebase');
const { sendMessage, tgFetch } = require('../infra/telegram');
const { addDaysFn, todayStrBrasilia } = require('../util/datas');

// ─── Handler de callback_query (botões inline) ────────────────────────────────
async function handleCallbackQuery(cbq) {
  const chatId    = cbq.message?.chat?.id;
  const msgId     = cbq.message?.message_id;
  const data      = cbq.data || '';
  const cbqId     = cbq.id;

  // Sempre responde para remover o spinner do botão
  await tgFetch('answerCallbackQuery', { callback_query_id: cbqId }).catch(() => {});
  if (!chatId) return;

  // Botão de cabeçalho sem ação
  if (data === 'noop') return;

  // Verifica vínculo
  const snap = await db.collection('users').where('telegramChatId', '==', String(chatId)).limit(1).get();
  if (snap.empty) return;
  const uid   = snap.docs[0].id;
  let tipos   = await getTelegramTipos(uid);

  // ── Interceptadores de Ações Rápidas (Pagar, Adiar, Confirmar Webhook)
  if (data.startsWith('pay:')) {
    const parts = data.split(':');
    const txId = parts[1];
    const occDate = parts[2];
    try {
      await handlePayCallback(chatId, uid, txId, occDate);
      const updatedText = (cbq.message?.text || '') + `\n\n✅ *Pago em ${todayStrBrasilia().split('-').reverse().join('/')}*`;
      await tgFetch('editMessageText', {
        chat_id: chatId,
        message_id: msgId,
        text: updatedText,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [] }
      });
    } catch (err) {
      logger.error('[pay callback]', err);
      await sendMessage(chatId, `❌ Erro ao registrar pagamento: ${err.message}`);
    }
    return;
  }

  if (data.startsWith('paycard:')) {
    const parts = data.split(':');
    const cardId = parts[1];
    const occDate = parts[2];
    try {
      const res = await handlePayCardCallback(chatId, uid, cardId, occDate);
      const updatedText = (cbq.message?.text || '') + (res?.jaPaga
        ? '\n\nℹ️ *Essa fatura já estava paga — nada foi alterado.*'
        : `\n\n✅ *Fatura paga em ${todayStrBrasilia().split('-').reverse().join('/')}*`);
      await tgFetch('editMessageText', {
        chat_id: chatId,
        message_id: msgId,
        text: updatedText,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [] }
      });
    } catch (err) {
      logger.error('[paycard callback]', err);
      await sendMessage(chatId, `❌ Erro ao registrar pagamento da fatura: ${err.message}`);
    }
    return;
  }

  if (data.startsWith('postpone:')) {
    const parts = data.split(':');
    const txId = parts[1];
    const occDate = parts[2];
    const days = parts[3];
    try {
      await handlePostponeCallback(chatId, uid, txId, occDate, days);
      const postDateFmt = addDaysFn(occDate, parseInt(days)).split('-').reverse().join('/');
      const updatedText = (cbq.message?.text || '') + `\n\n📅 *Adiado para ${postDateFmt}*`;
      await tgFetch('editMessageText', {
        chat_id: chatId,
        message_id: msgId,
        text: updatedText,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [] }
      });
    } catch (err) {
      logger.error('[postpone callback]', err);
      await sendMessage(chatId, `❌ Erro ao adiar lançamento: ${err.message}`);
    }
    return;
  }

  if (data.startsWith('tx_ok:')) {
    const parts = data.split(':');
    const pendingId = parts[1];
    const catId = parts[2];
    try {
      await handleConfirmPendingTx(chatId, uid, pendingId, catId, msgId);
    } catch (err) {
      logger.error('[confirm pending callback]', err);
      await sendMessage(chatId, `❌ Erro ao confirmar lançamento: ${err.message}`);
    }
    return;
  }

  if (data.startsWith('tx_no:')) {
    const parts = data.split(':');
    const pendingId = parts[1];
    try {
      await handleIgnorePendingTx(chatId, uid, pendingId, msgId);
    } catch (err) {
      logger.error('[ignore pending callback]', err);
      await sendMessage(chatId, `❌ Erro ao ignorar despesa: ${err.message}`);
    }
    return;
  }

  // ── Toggle individual
  if (data.startsWith('tgl_')) {
    const id = data.slice(4);
    if (id in DEFAULT_TG_TIPOS) {
      tipos[id] = tipos[id] === false ? true : false;
      await saveTelegramTipos(uid, tipos);
    }
  }
  // ── Ativar todos
  else if (data === 'cfg_all_on') {
    Object.keys(DEFAULT_TG_TIPOS).forEach(id => { tipos[id] = true; });
    await saveTelegramTipos(uid, tipos);
    await tgFetch('answerCallbackQuery', { callback_query_id: cbqId, text: '✅ Todos os alertas ativados!' }).catch(() => {});
  }
  // ── Desativar todos
  else if (data === 'cfg_all_off') {
    Object.keys(DEFAULT_TG_TIPOS).forEach(id => { tipos[id] = false; });
    await saveTelegramTipos(uid, tipos);
    await tgFetch('answerCallbackQuery', { callback_query_id: cbqId, text: '❌ Todos os alertas desativados.' }).catch(() => {});
  }
  // ── Fechar menu
  else if (data === 'cfg_done') {
    await tgFetch('editMessageReplyMarkup', {
      chat_id: chatId, message_id: msgId, reply_markup: { inline_keyboard: [] },
    }).catch(() => {});
    return sendMessage(chatId, '✅ Configurações salvas! Use /configurar para ajustar novamente.');
  }

  // Atualiza a mensagem com o novo estado (exceto no fechar)
  if (data !== 'cfg_done') {
    await tgFetch('editMessageText', {
      chat_id:      chatId,
      message_id:   msgId,
      text:         buildConfigText(tipos),
      parse_mode:   'Markdown',
      reply_markup: buildConfigKeyboard(tipos),
    }).catch(() => {}); // ignora erro se mensagem não mudou
  }
}

module.exports = { handleCallbackQuery };
