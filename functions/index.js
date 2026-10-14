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

const { logger } = require('firebase-functions');
const { HttpsError, onCall, onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { handleCallbackQuery } = require('./lib/acoes/callbacks');
const { findSuggestedCategory, matchCardByName, matchWalletByName, parseBankNotification } = require('./lib/acoes/despesaPendente');
const { checkN25AcimaDaMedia } = require('./lib/alertas/acimaMedia');
const { checkN24AportePerdido } = require('./lib/alertas/aporte');
const { checkN18 } = require('./lib/alertas/economiaDia');
const { estadoAposEnvio, filtrarAlertasRepetidos, gravarEstadoAlertas, lerEstadoAlertas } = require('./lib/alertas/memoria');
const { checkNotifications } = require('./lib/alertas/notificacoes');
const { handleAjuda } = require('./lib/comandos/ajuda');
const { handleConfigurar } = require('./lib/comandos/configurar');
const { handleCartoes, handleCategoria, handleHistorico, handleHoje, handleMes, handleMeta, handleResumo, handleSaldo, handleSemana, msgSomenteApp } = require('./lib/comandos/consultas');
const { handleFatura, handleParcelados } = require('./lib/comandos/faturas');
const { handleGastos, handleMeses, handleTags } = require('./lib/comandos/gastos');
const { handleInvestimentos, handleReserva } = require('./lib/comandos/investimentos');
const { handleEconomias, handleInsight, handlePrevisao, handleProjecao, handleProximas, handleSaldoFinal } = require('./lib/comandos/planejamento');
const { handleVincular } = require('./lib/comandos/vincular');
const { REGION } = require('./lib/infra/config');
const { disableTelegramForUser } = require('./lib/infra/dados');
const { FieldValue, db } = require('./lib/infra/firebase');
const { sendMessage, sendPushNotification, tgFetch } = require('./lib/infra/telegram');
const { calcFaturaCardApp, calcSaldoSimples, expandRange } = require('./lib/motor/caixa');
const { reservaDaCaixinhaBot, saldoCaixinhaBot } = require('./lib/motor/caixinha');
const { computeSpentByCategory, expandDespesasBot } = require('./lib/motor/competencia');
const { calcParceladosBot } = require('./lib/motor/parcelados');
const { calcSobraSeguraBot, resumirSobraBot, sobraPorDataBot } = require('./lib/motor/sobra');
const { handleOnboardingStep } = require('./lib/onboarding/fluxo');
const { dateStrFromDate, getNowBrasilia, todayStrBrasilia } = require('./lib/util/datas');
const { formatBRL, parseBRL } = require('./lib/util/formato');

// ─── Processamento do update Telegram ────────────────────────────────────────
async function processUpdate(update) {
  // callback_query = botões inline pressionados
  if (update.callback_query) {
    return handleCallbackQuery(update.callback_query);
  }

  const msg = update.message || update.edited_message;
  if (!msg || !msg.text) return;

  const chatId   = msg.chat.id;
  const fromUser = msg.from;
  const text     = msg.text.trim();

  logger.info(`[TG] chat=${chatId} text="${text}"`);

  // Verifica se o usuário já está vinculado
  const usersSnap = await db.collection('users').where('telegramChatId', '==', String(chatId)).limit(1).get();
  const isLinked  = !usersSnap.empty;
  const uid       = isLinked ? usersSnap.docs[0].id : null;

  // Parse do comando
  const [rawCmd, ...argParts] = text.split(/\s+/);
  let cmd  = rawCmd.toLowerCase().replace(/@\w+$/, ''); // remove @BotName
  const args = argParts.join(' ');

  // Normalização do comando (mapeia botões de teclado personalizados)
  // Verifica o texto completo (não só cmd) para suportar botões com emoji prefix: "💰 Saldo" → cmd='💰'
  if (!cmd.startsWith('/')) {
    const t = text.toLowerCase();
    if (t.includes('saldo') && (t.includes('final') || t.includes('fim'))) cmd = '/saldofinal';
    else if (t.includes('saldo')) cmd = '/saldo';
    else if (t.includes('cart') || t.includes('cartões')) cmd = '/cartoes';
    else if (t.includes('fatur')) cmd = '/fatura';
    else if (t.includes('proje') || t.includes('projeção')) cmd = '/projecao';
    else if (t.includes('categor')) cmd = '/categoria';
    else if (t.includes('configur') || t.includes('alerta') || t.includes('⚙️')) cmd = '/configurar';
    else if (t.includes('meta')) cmd = '/meta';
    else if (/\btags?\b/.test(t)) cmd = '/tags';
    else if (t.includes('meses')) cmd = '/meses';
    else if (t.includes('gasto')) cmd = '/gastos';
    else if (t.includes('reserva')) cmd = '/reserva';
    else if (t.includes('investiment')) cmd = '/investimentos';
    else if (t.includes('insig') || t.includes('dica') || t.includes('insight')) cmd = '/insight';
    else if (t.includes('ajuda') || t.includes('help')) cmd = '/ajuda';
    else if (t.includes('parcela')) cmd = '/parcelados';
    else if (t.includes('hoje')) cmd = '/hoje';
    else if (t.includes('hist')) cmd = '/historico';
    else if (t.includes('seman')) cmd = '/semana';
    else if (t.includes('mes') || t.includes('mês')) cmd = '/mes';
    else if (t.includes('resum')) cmd = '/resumo';
  }

  // Comandos que não precisam de vínculo
  if (cmd === '/start' || cmd === '/vincular') {
    const code = args || (cmd === '/start' && argParts[0]) || '';
    return handleVincular(chatId, code, fromUser);
  }

  if (!isLinked) {
    return sendMessage(chatId,
      '👋 Olá! Para usar o bot, vincule sua conta:\n\n' +
      '1. Abra o app *Matoba Finanças*\n' +
      `2. Vá em *Configurações → Bot do Telegram*\n` +
      '3. Gere um código e envie `/vincular CÓDIGO` aqui'
    );
  }

  // Onboarding ativo: as respostas (texto comum e /pular) vão para o cadastro de alertas. Comandos com "/"
  // funcionam normalmente (antes eram tratados como resposta inválida) e o bot lembra que o cadastro segue pendente.
  let lembreteOnboarding = false;
  {
    const userData   = usersSnap.docs[0].data();
    const onboarding = userData.telegramOnboarding;
    if (onboarding?.active) {
      const ehPular = /^\/(pular|skip)$/i.test(text);
      if (!text.startsWith('/') || ehPular) {
        return handleOnboardingStep(chatId, uid, onboarding, text);
      }
      lembreteOnboarding = true;
    }
  }

  // Comandos que tentam adicionar/editar → redireciona para o app
  const CMDS_BLOQUEADOS = ['/adicionar','/add','/novo','/new','/editar','/edit','/excluir','/deletar','/delete','/remover','/remove'];
  if (CMDS_BLOQUEADOS.includes(cmd)) {
    return msgSomenteApp(chatId);
  }

  const executarComando = async () => {
  switch (cmd) {
    case '/saldo':     return handleSaldo(chatId, uid);
    case '/hoje':      return handleHoje(chatId, uid);
    case '/historico': return handleHistorico(chatId, uid);
    case '/semana':    return handleSemana(chatId, uid);
    case '/mes':       return handleMes(chatId, uid, args);
    case '/resumo':    return handleResumo(chatId, uid);
    case '/categoria': return handleCategoria(chatId, uid);
    case '/meta':      return handleMeta(chatId, uid);
    case '/gastos':         return handleGastos(chatId, uid, args);
    case '/meses':          return handleMeses(chatId, uid, args);
    case '/tags':           return handleTags(chatId, uid, args);
    case '/reserva':        return handleReserva(chatId, uid);
    case '/investimentos':  return handleInvestimentos(chatId, uid);
    case '/cartoes':   return handleCartoes(chatId, uid);
    case '/fatura':    return handleFatura(chatId, uid);
    case '/projecao':  return handleProjecao(chatId, uid);
    case '/insight':    return handleInsight(chatId, uid);
    case '/proximas':    return handleProximas(chatId, uid);
    case '/previsao':    return handlePrevisao(chatId, uid);
    case '/economias':   return handleEconomias(chatId, uid);
    case '/parcelados':  return handleParcelados(chatId, uid);
    case '/saldofinal':  return handleSaldoFinal(chatId, uid, args);
    case '/configurar':
    case '/alertas':   return handleConfigurar(chatId, uid);
    case '/ajuda':
    case '/help':      return handleAjuda(chatId);
    default:
      return sendMessage(chatId,
        `Comando não reconhecido. Use /ajuda para ver todos os comandos disponíveis.`
      );
  }
  };

  const resultado = await executarComando();
  if (lembreteOnboarding) {
    await sendMessage(chatId,
      `ℹ️ _Seu cadastro de alertas ainda está em andamento. Quando quiser, responda a última pergunta ou envie /pular para usar o padrão._`
    );
  }
  return resultado;
}

// ─── EXPORT 1: Webhook HTTPS ──────────────────────────────────────────────────
// invoker: 'public' — permite chamadas não autenticadas (necessário para o Telegram)
exports.telegramWebhook = onRequest(
  { region: REGION, timeoutSeconds: 30, invoker: 'public' },
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

exports.sendTestPush = onCall(
  { region: REGION },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Faça login para testar o push.');
    }

    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();
    const fcmToken = userDoc.data()?.fcmToken;

    if (!fcmToken) {
      throw new HttpsError('failed-precondition', 'Nenhum token FCM salvo para este usuário.');
    }

    try {
      const messageId = await sendPushNotification(
        fcmToken,
        '🔔 *Teste de push real*\nSe esta notificação chegou, o Firebase Cloud Messaging está funcionando.'
      );

      await userRef.set({
        lastTestPush: {
          ok: true,
          messageId,
          tokenSuffix: String(fcmToken).slice(-12),
          sentAt: FieldValue.serverTimestamp(),
        },
      }, { merge: true });

      return {
        ok: true,
        messageId,
        tokenSuffix: String(fcmToken).slice(-12),
        sentAt: new Date().toISOString(),
      };
    } catch (err) {
      logger.error(`[TEST PUSH] Erro FCM uid=${uid}:`, err);
      const code = err?.errorInfo?.code || err?.code;
      if (code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token') {
        await userRef.set({
          fcmToken: FieldValue.delete(),
          fcmUpdatedAt: FieldValue.delete(),
        }, { merge: true });
        throw new HttpsError('failed-precondition', 'Token FCM inválido. Ative o push novamente.');
      }
      throw new HttpsError('internal', err.message || 'Erro ao enviar push de teste.');
    }
  }
);

// ─── EXPORT 3: Status e configuração do webhook ───────────────────────────────
// GET  → retorna informações atuais do webhook registrado no Telegram
// POST → registra a URL passada no body { url: "https://..." }
// Lista de comandos exibidos no menu do BotFather
const BOT_COMMANDS = [
  { command: 'saldo',      description: 'Saldo atual da conta' },
  { command: 'hoje',       description: 'Lancamentos registrados hoje' },
  { command: 'historico',  description: 'Ultimos 10 lancamentos' },
  { command: 'semana',     description: 'Grafico de saidas dos ultimos 7 dias' },
  { command: 'mes',        description: 'Resumo do mes (ex: /mes 4 para abril)' },
  { command: 'resumo',     description: 'Entradas, saidas e saldo do mes corrente' },
  { command: 'categoria',  description: 'Orcamento por categoria com barras de progresso' },
  { command: 'meta',       description: 'Status das metas da Divisao Percentual' },
  { command: 'gastos',     description: 'Despesas do mes por categoria (ex: /gastos agosto, /gastos top)' },
  { command: 'meses',      description: 'Total gasto por mes e mes mais alto' },
  { command: 'tags',       description: 'Total gasto por tag no mes (ex: /tags agosto)' },
  { command: 'reserva',    description: 'Status da reserva de emergencia' },
  { command: 'investimentos', description: 'Total investido e sobra disponivel' },
  { command: 'insight',    description: 'Dicas e analises inteligentes de gastos' },
  { command: 'cartoes',    description: 'Cartoes cadastrados e vencimentos' },
  { command: 'fatura',     description: 'Itens e total acumulado na fatura atual' },
  { command: 'projecao',   description: 'Saldo projetado para os proximos 7 dias' },
  { command: 'configurar', description: 'Ativar ou desativar alertas automaticos pelo bot' },
  { command: 'ajuda',      description: 'Lista completa de comandos' },
];

exports.setTelegramWebhook = onRequest(
  { region: REGION },
  async (req, res) => {
    if (req.method === 'POST' && req.body?.url) {
      const webhookResult = await tgFetch('setWebhook', {
        url:             req.body.url,
        allowed_updates: ['message', 'callback_query'],
        secret_token:    process.env.TELEGRAM_SECRET_TOKEN || undefined,
      });
      // Registra comandos no BotFather junto com o webhook
      const cmdsResult = await tgFetch('setMyCommands', { commands: BOT_COMMANDS });
      res.json({ registered: req.body.url, webhook: webhookResult, commands: cmdsResult });
    } else if (req.method === 'POST' && req.body?.registerCommands) {
      // POST { registerCommands: true } — apenas atualiza os comandos
      const cmdsResult = await tgFetch('setMyCommands', { commands: BOT_COMMANDS });
      res.json({ commands: cmdsResult });
    } else {
      // GET: retorna status atual do webhook
      const info = await tgFetch('getWebhookInfo', {});
      res.json(info);
    }
  }
);

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

// Só para testes automatizados (vitest define VITEST); em produção nada extra é exportado.
if (process.env.VITEST) {
  module.exports.__test = {
    expandRange, calcSaldoSimples, calcFaturaCardApp, calcParceladosBot, expandDespesasBot,
    checkNotifications, checkN24AportePerdido, checkN25AcimaDaMedia, saldoCaixinhaBot, reservaDaCaixinhaBot, filtrarAlertasRepetidos, estadoAposEnvio,
    calcSobraSeguraBot, sobraPorDataBot, resumirSobraBot,
    computeSpentByCategory, formatBRL,
  };
}
