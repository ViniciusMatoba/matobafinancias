'use strict';

const { getMessaging } = require('./firebase');

// ─── Configuração ──────────────────────────────────────────────────────────────
const BOT_TOKEN   = process.env.TELEGRAM_BOT_TOKEN || '';

const TELEGRAM    = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ─── Helpers Telegram ─────────────────────────────────────────────────────────
async function tgFetch(method, body) {
  const res = await fetch(`${TELEGRAM}/${method}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  return res.json();
}

async function sendMessage(chatId, text, extra = {}) {
  return tgFetch('sendMessage', {
    chat_id:    chatId,
    text,
    parse_mode: 'Markdown',
    ...extra,
  });
}

function notificationParts(markdownText) {
  const clean = String(markdownText || '')
    .replace(/\*/g, '')
    .replace(/_/g, '')
    .trim();
  const [firstLine = 'Matoba Finanças', ...rest] = clean.split('\n');
  const title = firstLine.slice(0, 80) || 'Matoba Finanças';
  const body = rest.join(' ').replace(/\s+/g, ' ').trim().slice(0, 220);
  return { title, body };
}

async function sendPushNotification(token, markdownText) {
  const { title, body } = notificationParts(markdownText);
  return getMessaging().send({
    token,
    // Campo notification obrigatório para iOS e para resolver conflito no SW
    notification: { title, body },
    data: { title, body, url: APP_URL, tag: 'matoba-financas' },
    webpush: {
      notification: {
        title,
        body,
        icon:               '/icons/icon-192.png',
        badge:              '/icons/icon-192.png',
        tag:                'matoba-financas',
        requireInteraction: false,
        data:               { url: APP_URL },
      },
      headers:    { TTL: '300', Urgency: 'high' },
      fcmOptions: { link: APP_URL },
    },
    apns: {
      payload: { aps: { alert: { title, body }, sound: 'default', badge: 1 } },
    },
  });
}

const APP_URL = 'https://viniciusmatoba.github.io/matobafinancias/';

module.exports = { BOT_TOKEN, TELEGRAM, tgFetch, sendMessage, notificationParts, sendPushNotification, APP_URL };
