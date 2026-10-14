'use strict';

const { logger } = require('firebase-functions');
const { FieldValue, db } = require('./firebase');

async function loadUserData(uid) {
  const [txSnap, walletSnap] = await Promise.all([
    db.collection('transactions').doc(uid).collection('entries').get(),
    db.collection('wallets').where('userId', '==', uid).get(),
  ]);
  const transactions    = txSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const walletInitials  = walletSnap.docs.reduce((acc, d) => acc + (Number(d.data().saldoInicial) || 0), 0);
  return { transactions, walletInitials };
}

// Tags criadas pelo usuário no app: [{ id, label, cor }]
async function loadTags(uid) {
  const snap = await db.collection('config').doc(uid).get();
  const tags = snap.exists ? snap.data().tags : [];
  return Array.isArray(tags) ? tags.filter(t => t && t.id && t.label) : [];
}

// Desativa a integração do Telegram para um usuário que bloqueou o bot ou cujo chat não existe mais
async function disableTelegramForUser(uid) {
  try {
    await db.collection('users').doc(uid).set({
      telegramChatId: FieldValue.delete(),
      telegramName: FieldValue.delete(),
      telegramLinkedAt: FieldValue.delete(),
    }, { merge: true });

    const configDoc = await db.collection('config').doc(uid).get();
    if (configDoc.exists) {
      const prefs = configDoc.data().notificacoes || {};
      await db.collection('config').doc(uid).set({
        notificacoes: {
          ...prefs,
          telegramEnabled: false,
        }
      }, { merge: true });
    }
    logger.info(`[TELEGRAM] Integração desativada com sucesso para o usuário uid=${uid}`);
  } catch (err) {
    logger.error(`[TELEGRAM] Erro ao desativar integração para o usuário uid=${uid}:`, err);
  }
}

module.exports = { loadUserData, loadTags, disableTelegramForUser };
