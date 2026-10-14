/**
 * Matoba Finanças — Firebase Cloud Functions
 *
 * Funções exportadas:
 *  - telegramWebhook       : recebe updates do Telegram (HTTPS)
 *  - dailyNotifications    : dispara alertas diários às 07h Brasília (Scheduler)
 *  - setTelegramWebhook    : helper HTTP para registrar a URL do webhook no Telegram (chamar 1x após deploy)
 *
 * Pré-requisitos:
 *  1. Criar arquivo functions/.env com: TELEGRAM_BOT_TOKEN=seu_token
 *  2. Ter o plano Blaze ativo no Firebase
 *  3. Deploy: firebase deploy --only functions
 *  4. Registrar webhook: GET https://us-central1-matobafinancas.cloudfunctions.net/setTelegramWebhook
 */

'use strict';

const { checkN25AcimaDaMedia } = require('./lib/alertas/acimaMedia');
const { checkN24AportePerdido } = require('./lib/alertas/aporte');
const { estadoAposEnvio, filtrarAlertasRepetidos } = require('./lib/alertas/memoria');
const { checkNotifications } = require('./lib/alertas/notificacoes');
const { calcFaturaCardApp, calcSaldoSimples, expandRange } = require('./lib/motor/caixa');
const { reservaDaCaixinhaBot, saldoCaixinhaBot } = require('./lib/motor/caixinha');
const { computeSpentByCategory, expandDespesasBot } = require('./lib/motor/competencia');
const { calcParceladosBot } = require('./lib/motor/parcelados');
const { calcSobraSeguraBot, resumirSobraBot, sobraPorDataBot } = require('./lib/motor/sobra');
const { formatBRL } = require('./lib/util/formato');

// As 5 funções do Firebase são registradas pelos módulos de lib/entradas (cada um faz exports.X = ...)
Object.assign(module.exports, require('./lib/entradas/webhookTelegram'));
Object.assign(module.exports, require('./lib/entradas/agendador'));
Object.assign(module.exports, require('./lib/entradas/sendTestPush'));
Object.assign(module.exports, require('./lib/entradas/setWebhook'));
Object.assign(module.exports, require('./lib/entradas/smsWebhook'));

// Só para testes automatizados (vitest define VITEST); em produção nada extra é exportado.
if (process.env.VITEST) {
  module.exports.__test = {
    expandRange, calcSaldoSimples, calcFaturaCardApp, calcParceladosBot, expandDespesasBot,
    checkNotifications, checkN24AportePerdido, checkN25AcimaDaMedia, saldoCaixinhaBot, reservaDaCaixinhaBot, filtrarAlertasRepetidos, estadoAposEnvio,
    calcSobraSeguraBot, sobraPorDataBot, resumirSobraBot,
    computeSpentByCategory, formatBRL,
  };
}
