'use strict';

const { logger } = require('firebase-functions');
const { onRequest } = require('firebase-functions/v2/https');
const { findSuggestedCategory, matchCardByName, matchWalletByName, parseBankNotification } = require('../acoes/despesaPendente');
const { REGION } = require('../infra/config');
const { FieldValue, db } = require('../infra/firebase');
const { tgFetch } = require('../infra/telegram');
const { todayStrBrasilia } = require('../util/datas');
const { formatBRL } = require('../util/formato');

// ─── EXPORT 4: Webhook de Automação de Gastos (MacroDroid/Tasker) ─────────────
exports.smsWebhook = onRequest(
  { region: REGION, timeoutSeconds: 30, invoker: 'public' },
  async (req, res) => {
    const token = req.query.token;
    if (!token) {
      res.status(400).send("Falta o token de autenticação.");
      return;
    }
    
    try {
      const usersSnap = await db.collection('users').where('webhookToken', '==', token).limit(1).get();
      if (usersSnap.empty) {
        res.status(403).send("Token inválido.");
        return;
      }
      const userDoc = usersSnap.docs[0];
      const uid = userDoc.id;
      const userData = userDoc.data();
      const chatId = userData.telegramChatId;
      
      if (!chatId) {
        res.status(400).send("Telegram não vinculado.");
        return;
      }
      
      let text = "";
      if (typeof req.body === 'string') {
        text = req.body;
      } else if (req.body && typeof req.body.text === 'string') {
        text = req.body.text;
      } else if (req.body && typeof req.body.message === 'string') {
        text = req.body.message;
      } else {
        text = JSON.stringify(req.body);
      }
      
      logger.info(`[Webhook] user=${uid} text="${text}"`);
      
      const parsed = parseBankNotification(text);
      if (!parsed) {
        res.status(200).send("Texto não reconhecido como notificação bancária válida.");
        return;
      }
      
      const { valor, estabelecimento, isCredito, banco } = parsed;
      
      const entriesSnap = await db.collection('transactions').doc(uid).collection('entries').get();
      const txs = entriesSnap.docs.map(d => d.data());
      const suggestedCat = findSuggestedCategory(txs, estabelecimento);
      
      let cartaoId = null;
      let carteiraId = null;
      
      if (isCredito) {
        const cardsSnap = await db.collection('cards').doc(uid).collection('list').get();
        const cards = cardsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const matchedCard = matchCardByName(cards, banco);
        if (matchedCard) {
          cartaoId = matchedCard.id;
        }
      } else {
        const walletsSnap = await db.collection('wallets').where('userId', '==', uid).get();
        const wallets = walletsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const matchedWallet = matchWalletByName(wallets, banco);
        if (matchedWallet) {
          carteiraId = matchedWallet.id;
        }
      }
      
      const pendingRef = db.collection('users').doc(uid).collection('pendingTransactions').doc();
      const pendingId = pendingRef.id;
      const today = todayStrBrasilia();
      
      await pendingRef.set({
        descricao: estabelecimento,
        valor: valor,
        tipo: isCredito ? 'cartao' : 'saida',
        cartaoId: cartaoId,
        carteiraId: carteiraId,
        dataCompra: today,
        createdAt: FieldValue.serverTimestamp()
      });
      
      const paymentLabel = isCredito ? 'Crédito' : 'Débito/Pix';
      const bancoLabel = banco ? ` (${banco})` : '';
      let msgText = `💸 *Novo gasto detectado!*${bancoLabel}\n\n`;
      msgText += `• Estabelecimento: *${estabelecimento}*\n`;
      msgText += `• Valor: *${formatBRL(valor)}*\n`;
      msgText += `• Forma: *${paymentLabel}*\n\n`;
      msgText += `Como deseja salvar este lançamento?`;
      
      const inline_keyboard = [];
      
      const CATEGORY_LABELS = {
        liberdade: '💎 Liberdade',
        custos_fixos: '🏠 Custos Fixos',
        conforto: '🛋 Conforto',
        metas: '🎯 Metas',
        prazeres: '🎉 Prazeres',
        conhecimento: '📚 Conhecimento'
      };
      
      if (suggestedCat && CATEGORY_LABELS[suggestedCat]) {
        inline_keyboard.push([
          { text: `✅ Salvar em ${CATEGORY_LABELS[suggestedCat]} (Sugerido)`, callback_data: `tx_ok:${pendingId}:${suggestedCat}` }
        ]);
      }
      
      const catKeys = Object.keys(CATEGORY_LABELS);
      for (let i = 0; i < catKeys.length; i += 2) {
        const row = [];
        const c1 = catKeys[i];
        const c2 = catKeys[i+1];
        row.push({ text: CATEGORY_LABELS[c1], callback_data: `tx_ok:${pendingId}:${c1}` });
        if (c2) {
          row.push({ text: CATEGORY_LABELS[c2], callback_data: `tx_ok:${pendingId}:${c2}` });
        }
        inline_keyboard.push(row);
      }
      
      inline_keyboard.push([
        { text: `❌ Ignorar Despesa`, callback_data: `tx_no:${pendingId}` }
      ]);
      
      await tgFetch('sendMessage', {
        chat_id: chatId,
        text: msgText,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard }
      });
      
      res.status(200).send("Mensagem enviada com sucesso.");
    } catch (err) {
      logger.error('[smsWebhook]', err);
      res.status(500).send(`Erro interno: ${err.message}`);
    }
  }
);
