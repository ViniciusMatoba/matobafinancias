'use strict';

const { logger } = require('firebase-functions');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { checkN25AcimaDaMedia } = require('../alertas/acimaMedia');
const { checkN24AportePerdido } = require('../alertas/aporte');
const { checkN18 } = require('../alertas/economiaDia');
const { estadoAposEnvio, filtrarAlertasRepetidos, gravarEstadoAlertas, lerEstadoAlertas } = require('../alertas/memoria');
const { checkNotifications } = require('../alertas/notificacoes');
const { REGION } = require('../infra/config');
const { disableTelegramForUser } = require('../infra/dados');
const { FieldValue, db } = require('../infra/firebase');
const { sendMessage, sendPushNotification } = require('../infra/telegram');
const { dateStrFromDate, getNowBrasilia } = require('../util/datas');
const { parseBRL } = require('../util/formato');

// ─── EXPORT 2: Notificações — 07h, 12h e 19h Brasília (10h, 15h, 22h UTC) ─────
exports.dailyNotifications = onSchedule(
  { schedule: '0 10,15,22 * * *', timeZone: 'UTC', region: REGION },
  async () => {
    const horaAtual = getNowBrasilia().getHours(); // 7, 12 ou 19
    const hojeBr    = dateStrFromDate(getNowBrasilia());
    logger.info(`[NOTIF] Rodando para hora Brasília: ${horaAtual}h`);

    // Busca usuários com Telegram ou token FCM registrado.
    // As preferências finais continuam vindo de config/{uid}.
    const usersSnap = await db.collection('users').get();

    if (usersSnap.empty) {
      logger.info('[NOTIF] Nenhum usuário cadastrado para notificações.');
      return;
    }

    for (const userDoc of usersSnap.docs) {
      const uid      = userDoc.id;
      const userData = userDoc.data();
      const chatId   = userData.telegramChatId;
      const fcmToken = userData.fcmToken;

      try {
        // Lê configurações do usuário
        const configDoc = await db.collection('config').doc(uid).get();
        const config    = configDoc.exists ? configDoc.data() : {};
        const prefs     = config.notificacoes || {};

        const pushEnabled     = prefs.enabled === true && !!fcmToken;
        const telegramEnabled = prefs.telegramEnabled === true && !!chatId;
        if (!pushEnabled && !telegramEnabled) continue;

        // Verifica se o horário configurado pelo usuário bate com o horário atual
        const horaUsuario = prefs.horaAlerta ?? 7;
        const horaMatch   = horaUsuario === horaAtual;
        // N18 sempre roda às 19h, independente de horaAlerta
        const n18Ativo    = horaAtual === 19;

        if (!horaMatch && !n18Ativo) continue;

        // Lê cartões, transações, carteiras e metas em paralelo
        const [cardsSnap, txSnap, walletSnap, goalsSnap] = await Promise.all([
          db.collection('cards').doc(uid).collection('list').get(),
          db.collection('transactions').doc(uid).collection('entries').get(),
          db.collection('wallets').where('userId', '==', uid).get(),
          db.collection('goals').where('userId', '==', uid).get(),
        ]);
        const cards          = cardsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const transactions   = txSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const walletInitials = walletSnap.docs.reduce((acc, d) => acc + (parseBRL(d.data().saldoInicial) || 0), 0);
        const goals          = goalsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // ── N1–N17: apenas quando o horário do usuário bate ──────────────────
        if (horaMatch) {
          // Push
          if (pushEnabled) {
            const pushPrefs = { ...prefs, tipos: prefs.tipos || {} };
            const pushBruto = checkNotifications(cards, transactions, config, pushPrefs, goals, walletInitials);
            const pushEstadoAnt = await lerEstadoAlertas(uid, 'push');
            const pushFiltro = filtrarAlertasRepetidos(pushBruto, pushEstadoAnt, hojeBr);
            const pushMsgs  = pushFiltro.enviar;
            const pushFalhas = new Set();
            for (const msg of pushMsgs) {
              try {
                const text = typeof msg === 'string' ? msg : msg.text;
                await sendPushNotification(fcmToken, text);
              } catch (pushErr) {
                if (msg && msg.estado) pushFalhas.add(msg.estado.chave);
                logger.error(`[PUSH] Erro FCM uid=${uid}:`, pushErr);
                const code = pushErr?.errorInfo?.code || pushErr?.code;
                if (code === 'messaging/registration-token-not-registered' ||
                    code === 'messaging/invalid-registration-token') {
                  await userDoc.ref.set({
                    fcmToken: FieldValue.delete(),
                    fcmUpdatedAt: FieldValue.delete(),
                  }, { merge: true });
                }
              }
            }
            await gravarEstadoAlertas(uid, 'push', estadoAposEnvio(pushFiltro.estadoNovo, pushEstadoAnt, pushFalhas));
            if (pushMsgs.length > 0)
              logger.info(`[PUSH] uid=${uid}: ${pushMsgs.length} alerta(s) enviado(s)`);
          }

          // Telegram
          if (telegramEnabled) {
            const tgTipos = prefs.telegramTipos !== undefined ? prefs.telegramTipos : (prefs.tipos || {});
            const tgPrefs = { ...prefs, tipos: tgTipos };
            const tgBruto = checkNotifications(cards, transactions, config, tgPrefs, goals, walletInitials);
            const tgEstadoAnt = await lerEstadoAlertas(uid, 'telegram');
            const tgFiltro = filtrarAlertasRepetidos(tgBruto, tgEstadoAnt, hojeBr);
            const tgMsgs  = tgFiltro.enviar;
            let tgBlocked = false;
            const tgFalhas = new Set();
            for (const msg of tgMsgs) {
              const msgObj = typeof msg === 'string' ? { text: msg } : msg;
              let extra = {};
              if (msgObj.txId && msgObj.occDate) {
                if (msgObj.txId.startsWith('virtual:')) {
                  const cardId = msgObj.txId.split(':')[1];
                  extra = {
                    reply_markup: {
                      inline_keyboard: [
                        [
                          { text: '✅ Pago', callback_data: `paycard:${cardId}:${msgObj.occDate}` }
                        ]
                      ]
                    }
                  };
                } else {
                  extra = {
                    reply_markup: {
                      inline_keyboard: [
                        [
                          { text: '✅ Pago', callback_data: `pay:${msgObj.txId}:${msgObj.occDate}` },
                          { text: '📅 Adiar 5 dias', callback_data: `postpone:${msgObj.txId}:${msgObj.occDate}:5` }
                        ]
                      ]
                    }
                  };
                }
              }
              const tgRes = await sendMessage(chatId, msgObj.text, extra);
              if (tgRes && tgRes.ok === false) {
                if (msgObj.estado) tgFalhas.add(msgObj.estado.chave);
                const isBlocked = tgRes.error_code === 403 || 
                  (tgRes.error_code === 400 && tgRes.description?.includes('chat not found'));
                if (isBlocked) {
                  logger.warn(`[TELEGRAM] Envio falhou (bot bloqueado/chat não encontrado) para uid=${uid}. Desativando.`);
                  await disableTelegramForUser(uid);
                  tgBlocked = true;
                  break;
                }
              }
              await new Promise(r => setTimeout(r, 100));
            }
            if (!tgBlocked) await gravarEstadoAlertas(uid, 'telegram', estadoAposEnvio(tgFiltro.estadoNovo, tgEstadoAnt, tgFalhas));
            if (tgMsgs.length > 0 && !tgBlocked)
              logger.info(`[TELEGRAM] uid=${uid}: ${tgMsgs.length} alerta(s) enviado(s)`);
          }
        }

        // ── N18 — Economia do dia (sempre às 19h para todos os usuários) ─────
        if (n18Ativo) {
          const pushN18Tipos = { n18: (prefs.tipos?.n18 !== false) };
          const tgN18Tipos   = { n18: ((prefs.telegramTipos ?? prefs.tipos ?? {}).n18 !== false) };

          if (pushEnabled) {
            const n18Msgs = checkN18(transactions, config, pushN18Tipos);
            for (const msg of n18Msgs) {
              try {
                await sendPushNotification(fcmToken, msg);
              } catch (e) {
                logger.error(`[PUSH N18] uid=${uid}:`, e.message);
              }
            }
          }

          if (telegramEnabled) {
            const n18Msgs = checkN18(transactions, config, tgN18Tipos);
            let tgBlocked = false;
            for (const msg of n18Msgs) {
              const tgRes = await sendMessage(chatId, msg);
              if (tgRes && tgRes.ok === false) {
                const isBlocked = tgRes.error_code === 403 || 
                  (tgRes.error_code === 400 && tgRes.description?.includes('chat not found'));
                if (isBlocked) {
                  logger.warn(`[TELEGRAM] Envio N18 falhou (bot bloqueado/chat não encontrado) para uid=${uid}. Desativando.`);
                  await disableTelegramForUser(uid);
                  tgBlocked = true;
                  break;
                }
              }
              await new Promise(r => setTimeout(r, 100));
            }
            if (n18Msgs.length > 0 && !tgBlocked)
              logger.info(`[N18] uid=${uid}: economia do dia enviada`);
          }

          // ── N24 — Alerta de aporte perdido (Telegram) ────────────────────
          if (telegramEnabled) {
            const n24Tipos = { n24: ((prefs.telegramTipos ?? prefs.tipos ?? {}).n24 !== false) };
            try {
              const n24 = await checkN24AportePerdido(uid, transactions, config, walletInitials, n24Tipos);
              if (n24) {
                const tgRes = await sendMessage(chatId, n24.text);
                if (tgRes && tgRes.ok === false) {
                  // Envio falhou: NÃO confirma, para o lembrete ser tentado de novo no próximo ciclo
                  const isBlocked = tgRes.error_code === 403 ||
                    (tgRes.error_code === 400 && tgRes.description?.includes('chat not found'));
                  if (isBlocked) {
                    logger.warn(`[TELEGRAM] Envio N24 falhou (bot bloqueado) para uid=${uid}. Desativando.`);
                    await disableTelegramForUser(uid);
                  }
                } else {
                  await n24.confirmar();
                  logger.info(`[N24] uid=${uid}: alerta de aporte perdido enviado`);
                }
              }
            } catch (e24) {
              logger.error(`[N24] uid=${uid}:`, e24.message);
            }
          }

          // ── N25 — Categoria acima da média (Telegram) ────────────────────
          if (telegramEnabled) {
            const n25Tipos = { n25: ((prefs.telegramTipos ?? prefs.tipos ?? {}).n25 !== false) };
            try {
              const n25 = await checkN25AcimaDaMedia(uid, transactions, config, n25Tipos);
              if (n25) {
                const tgRes = await sendMessage(chatId, n25.text);
                if (tgRes && tgRes.ok === false) {
                  // Envio falhou: NÃO marca as categorias como avisadas, para tentar de novo no próximo ciclo
                  const isBlocked = tgRes.error_code === 403 ||
                    (tgRes.error_code === 400 && tgRes.description?.includes('chat not found'));
                  if (isBlocked) {
                    logger.warn(`[TELEGRAM] Envio N25 falhou (bot bloqueado) para uid=${uid}. Desativando.`);
                    await disableTelegramForUser(uid);
                  }
                } else {
                  await n25.confirmar();
                  logger.info(`[N25] uid=${uid}: alerta de categoria acima da média enviado`);
                }
              }
            } catch (e25) {
              logger.error(`[N25] uid=${uid}:`, e25.message);
            }
          }
        }
      } catch (err) {
        logger.error(`[NOTIF] Erro ao processar uid=${uid}:`, err);
      }
    }

    logger.info('[NOTIF] Concluído.');
  }
);
