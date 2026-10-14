'use strict';

const { logger } = require('firebase-functions');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { processUpdate } = require('./roteador');
const { REGION } = require('../infra/config');

// Segredo guardado no Secret Manager (firebase functions:secrets:set TELEGRAM_SECRET_TOKEN); em execução
// fica disponível em process.env.TELEGRAM_SECRET_TOKEN. Vale em qualquer máquina de onde se publique.
const TELEGRAM_SECRET_TOKEN = defineSecret('TELEGRAM_SECRET_TOKEN');

// ─── EXPORT 1: Webhook HTTPS ──────────────────────────────────────────────────
// invoker: 'public' — permite chamadas não autenticadas (necessário para o Telegram)
exports.telegramWebhook = onRequest(
  { region: REGION, timeoutSeconds: 30, invoker: 'public', secrets: [TELEGRAM_SECRET_TOKEN] },
  async (req, res) => {
    if (req.method !== 'POST') { res.sendStatus(405); return; }

    // Validação de token secreto para segurança do webhook (evita spoofing)
    // Sem segredo configurado o webhook fica fechado (antes ficava aberto a qualquer chamada)
    const secretToken = process.env.TELEGRAM_SECRET_TOKEN;
    if (!secretToken) {
      logger.error('[TG webhook] TELEGRAM_SECRET_TOKEN não configurado — requisição recusada.');
      res.sendStatus(503);
      return;
    }
    const headerToken = req.headers['x-telegram-bot-api-secret-token'];
    if (headerToken !== secretToken) {
      logger.warn('[TG webhook] Requisição não autorizada — secret token incorreto ou ausente.');
      res.sendStatus(403);
      return;
    }

    try {
      await processUpdate(req.body);
    } catch (err) {
      logger.error('[TG webhook]', err);
    }
    res.sendStatus(200); // Telegram espera 200 sempre
  }
);
