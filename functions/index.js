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
const { checkN25AcimaDaMedia } = require('./lib/alertas/acimaMedia');
const { checkN24AportePerdido } = require('./lib/alertas/aporte');
const { checkN18 } = require('./lib/alertas/economiaDia');
const { estadoAposEnvio, filtrarAlertasRepetidos, gravarEstadoAlertas, lerEstadoAlertas } = require('./lib/alertas/memoria');
const { checkNotifications } = require('./lib/alertas/notificacoes');
const { handleAjuda } = require('./lib/comandos/ajuda');
const { DEFAULT_TG_TIPOS, buildConfigKeyboard, buildConfigText, getTelegramTipos, handleConfigurar, saveTelegramTipos } = require('./lib/comandos/configurar');
const { handleCartoes, handleCategoria, handleHistorico, handleHoje, handleMes, handleMeta, handleResumo, handleSaldo, handleSemana, msgSomenteApp } = require('./lib/comandos/consultas');
const { handleFatura, handleParcelados } = require('./lib/comandos/faturas');
const { handleGastos, handleMeses, handleTags } = require('./lib/comandos/gastos');
const { handleInvestimentos, handleReserva } = require('./lib/comandos/investimentos');
const { handleEconomias, handleInsight, handlePrevisao, handleProjecao, handleProximas, handleSaldoFinal } = require('./lib/comandos/planejamento');
const { REGION } = require('./lib/infra/config');
const { disableTelegramForUser, loadUserData } = require('./lib/infra/dados');
const { FieldValue, db } = require('./lib/infra/firebase');
const { sendMessage, sendPushNotification, tgFetch } = require('./lib/infra/telegram');
const { calcFaturaCardApp, calcSaldoSimples, expandRange, getProximoVencimentoBot } = require('./lib/motor/caixa');
const { reservaDaCaixinhaBot, saldoCaixinhaBot } = require('./lib/motor/caixinha');
const { computeSpentByCategory, expandDespesasBot } = require('./lib/motor/competencia');
const { itensDoLancamentoRealBot, ocorrenciaProjetada } = require('./lib/motor/faturaProjetada');
const { calcParceladosBot } = require('./lib/motor/parcelados');
const { calcSobraSeguraBot, resumirSobraBot, sobraPorDataBot } = require('./lib/motor/sobra');
const { addDaysFn, dateStrFromDate, getNowBrasilia, todayStrBrasilia } = require('./lib/util/datas');
const { formatBRL, parseBRL } = require('./lib/util/formato');

// ─── Handlers de comandos ─────────────────────────────────────────────────────

async function handleVincular(chatId, code, fromUser) {
  if (!code) {
    return sendMessage(chatId, '❌ Informe o código de vinculação.\nExemplo: `/vincular ABC123`');
  }

  const linkDoc = await db.collection('telegramLinks').doc(code.toUpperCase()).get();
  if (!linkDoc.exists) {
    return sendMessage(chatId, '❌ Código inválido ou expirado. Gere um novo código no aplicativo.');
  }

  const { uid, email, expiresAt } = linkDoc.data();
  if (new Date() > expiresAt.toDate()) {
    await linkDoc.ref.delete();
    return sendMessage(chatId, '⏰ Código expirado. Gere um novo código no aplicativo.');
  }

  // Salva chatId no usuário
  await db.collection('users').doc(uid).set({
    telegramChatId:  String(chatId),
    telegramName:    fromUser?.first_name || '',
    telegramLinkedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await linkDoc.ref.delete();

  return startOnboarding(chatId, uid, email, fromUser);
}

async function handlePayCallback(chatId, uid, txId, occDate) {
  const isVirtual = txId.includes('-proj-');
  const parentId = isVirtual ? txId.split('-proj-')[0] : txId;
  
  const txRef = db.collection('transactions').doc(uid).collection('entries').doc(parentId);
  const txDoc = await txRef.get();
  if (!txDoc.exists) {
    throw new Error("Lançamento não encontrado.");
  }
  const tx = txDoc.data();
  tx.id = txDoc.id;
  
  const today = todayStrBrasilia();
  
  if (isVirtual) {
    const ocorrencia = ocorrenciaProjetada(tx, occDate); // antes de excluir a data
    const exclusoes = [...(tx.exclusoes || [])];
    if (!exclusoes.includes(occDate)) exclusoes.push(occDate);
    await txRef.update({ exclusoes });

    await db.collection('transactions').doc(uid).collection('entries').add({
      tipo: tx.tipo,
      frequencia: 'unico',
      descricao: tx.tipo === 'cartao'
        ? (tx.descricao ? `Pagamento Fatura – ${tx.descricao}` : 'Pagamento de Fatura')
        : tx.descricao,
      valor: ocorrencia.valor,
      dataInicio: today,
      categoria: tx.categoria || null,
      dataFim: null,
      itens: itensDoLancamentoRealBot(ocorrencia.itens),
      cartaoId: tx.cartaoId || null,
      conferido: true
    });
  } else {
    if (!tx.frequencia || tx.frequencia === 'unico' || tx.frequencia === 'parcelado') {
      await txRef.update({ dataInicio: today, conferido: true });
    } else {
      const exclusoes = [...(tx.exclusoes || [])];
      if (!exclusoes.includes(occDate)) exclusoes.push(occDate);
      await txRef.update({ exclusoes });
      
      await db.collection('transactions').doc(uid).collection('entries').add({
        tipo: tx.tipo,
        frequencia: 'unico',
        descricao: tx.descricao,
        valor: tx.valor,
        dataInicio: today,
        categoria: tx.categoria || null,
        dataFim: null,
        conferido: true
      });
    }
  }
}

/**
 * Botão Pago de um cartão (alerta de vencimento sem fatura lançada de verdade).
 * Paga a fatura da data `occDate` — a do alerta, não a de "hoje" —, com as mesmas gravações do app:
 *  - fatura real pendente na data: vira paga e vai para hoje;
 *  - parcelas projetadas na data: a data é excluída do lançamento de origem e um único pagamento
 *    (itens como "não parcelados", para não projetar de novo) é criado.
 * Uma fatura paga também projeta parcelas, por isso o filtro de "conferido" vale por ocorrência.
 * Sem nada pendente na data não grava nada e devolve { jaPaga: true } (clique repetido, alerta antigo).
 */
async function handlePayCardCallback(chatId, uid, cardId, occDate) {
  const cardRef = db.collection('cards').doc(uid).collection('list').doc(cardId);
  const cardDoc = await cardRef.get();
  if (!cardDoc.exists) {
    throw new Error("Cartão não encontrado.");
  }
  const card = cardDoc.data();
  card.id = cardDoc.id;

  const today = todayStrBrasilia();
  const { transactions } = await loadUserData(uid);
  const cardTxs = transactions.filter(t => t.tipo === 'cartao' && t.cartaoId === card.id);
  const pendentes = expandRange(cardTxs, occDate, occDate)
    .filter(o => o.date === occDate && !o.tx.conferido);
  if (pendentes.length === 0) return { jaPaga: true };

  const entries = db.collection('transactions').doc(uid).collection('entries');
  const reais = new Map();
  const projetadas = [];
  for (const o of pendentes) {
    if (String(o.tx.id || '').includes('-proj-')) projetadas.push(o);
    else reais.set(o.tx.id, o);
  }

  for (const id of reais.keys()) {
    await entries.doc(id).update({ dataInicio: today, conferido: true });
  }

  if (projetadas.length > 0) {
    for (const o of projetadas) {
      const parentRef = entries.doc(o.tx.id.split('-proj-')[0]);
      const parentDoc = await parentRef.get();
      if (parentDoc.exists) {
        const exclusoes = [...(parentDoc.data().exclusoes || [])];
        if (!exclusoes.includes(o.date)) {
          exclusoes.push(o.date);
          await parentRef.update({ exclusoes });
        }
      }
    }
    const itens = projetadas.flatMap(o => o.tx.itens || []);
    await entries.add({
      tipo: 'cartao',
      frequencia: 'unico',
      descricao: `Pagamento Fatura - ${card.nome}`,
      valor: projetadas.reduce((acc, o) => acc + o.valor, 0),
      dataInicio: today,
      categoria: null,
      dataFim: null,
      itens: itensDoLancamentoRealBot(itens),
      cartaoId: cardId,
      conferido: true
    });
  }
  return { jaPaga: false };
}

async function handlePostponeCallback(chatId, uid, txId, occDate, days) {
  const isVirtual = txId.includes('-proj-');
  const parentId = isVirtual ? txId.split('-proj-')[0] : txId;
  
  const txRef = db.collection('transactions').doc(uid).collection('entries').doc(parentId);
  const txDoc = await txRef.get();
  if (!txDoc.exists) {
    throw new Error("Lançamento não encontrado.");
  }
  const tx = txDoc.data();
  tx.id = txDoc.id;
  
  const postponedDate = addDaysFn(occDate, parseInt(days));
  
  if (isVirtual) {
    const ocorrencia = ocorrenciaProjetada(tx, occDate); // antes de excluir a data
    const exclusoes = [...(tx.exclusoes || [])];
    if (!exclusoes.includes(occDate)) exclusoes.push(occDate);
    await txRef.update({ exclusoes });

    await db.collection('transactions').doc(uid).collection('entries').add({
      tipo: tx.tipo,
      frequencia: 'unico',
      descricao: tx.tipo === 'cartao'
        ? (tx.descricao ? `Pagamento Fatura – ${tx.descricao}` : 'Pagamento de Fatura')
        : tx.descricao,
      valor: ocorrencia.valor,
      dataInicio: postponedDate,
      categoria: tx.categoria || null,
      dataFim: null,
      itens: itensDoLancamentoRealBot(ocorrencia.itens),
      cartaoId: tx.cartaoId || null,
      conferido: false
    });
  } else {
    if (!tx.frequencia || tx.frequencia === 'unico' || tx.frequencia === 'parcelado') {
      await txRef.update({ dataInicio: postponedDate });
    } else {
      const exclusoes = [...(tx.exclusoes || [])];
      if (!exclusoes.includes(occDate)) exclusoes.push(occDate);
      await txRef.update({ exclusoes });
      
      await db.collection('transactions').doc(uid).collection('entries').add({
        tipo: tx.tipo,
        frequencia: 'unico',
        descricao: tx.descricao,
        valor: tx.valor,
        dataInicio: postponedDate,
        categoria: tx.categoria || null,
        dataFim: null,
        conferido: false
      });
    }
  }
}

function parseBankNotification(text) {
  const valorMatch = text.match(/R\$\s*([0-9.,]+)/i);
  if (!valorMatch) return null;
  const valorStr = valorMatch[1];
  const valor = parseBRL(valorStr);
  if (valor <= 0) return null;
  
  let cleanText = text.replace(valorMatch[0], '').replace(/\s+/g, ' ').trim();
  
  const t = text.toLowerCase();
  const isCredito = t.includes('crédito') || t.includes('credito') || t.includes('cartão') || t.includes('compra aprovada no seu');
  
  let banco = "";
  if (t.includes('nubank')) banco = "Nubank";
  else if (t.includes('inter')) banco = "Inter";
  else if (t.includes('itaú') || t.includes('itau')) banco = "Itaú";
  else if (t.includes('bradesco')) banco = "Bradesco";
  else if (t.includes('santander')) banco = "Santander";
  else if (t.includes('c6')) banco = "C6 Bank";
  else if (t.includes('banco do brasil') || t.includes(' bb ')) banco = "Banco do Brasil";
  
  let estabelecimento = "Despesa Webhook";
  const estMatch = cleanText.match(/(?:no|na|em|para|de)\s+([^.]+)/i);
  if (estMatch) {
    let est = estMatch[1].trim();
    est = est.replace(/\s+com\s+o\s+valor.*$/i, '');
    est = est.replace(/\s+no\s+crédito.*$/i, '');
    est = est.replace(/\s+no\s+débito.*$/i, '');
    est = est.replace(/\s+pelo\s+app.*$/i, '');
    est = est.replace(/[.!?]/g, '');
    if (est.length > 1) {
      estabelecimento = est.charAt(0).toUpperCase() + est.slice(1);
    }
  }
  
  return { valor, estabelecimento, isCredito, banco };
}

function findSuggestedCategory(txs, desc) {
  const cleanDesc = desc.trim().toLowerCase();
  const matchTx = txs.find(t => t.descricao && t.descricao.trim().toLowerCase() === cleanDesc && t.categoria);
  if (matchTx) return matchTx.categoria;
  
  for (const t of txs) {
    if (t.tipo === 'cartao' && Array.isArray(t.itens)) {
      const matchItem = t.itens.find(i => i.descricao && i.descricao.trim().toLowerCase() === cleanDesc && i.categoria);
      if (matchItem) return matchItem.categoria;
    }
  }
  return null;
}

function matchCardByName(cards, bankName) {
  if (!bankName) return cards[0] || null;
  const b = bankName.toLowerCase();
  return cards.find(c => c.nome && c.nome.toLowerCase().includes(b)) || cards[0] || null;
}

function matchWalletByName(wallets, bankName) {
  if (!bankName) return wallets[0] || null;
  const b = bankName.toLowerCase();
  return wallets.find(w => w.nome && w.nome.toLowerCase().includes(b)) || wallets[0] || null;
}

async function handleConfirmPendingTx(chatId, uid, pendingId, catId, msgId) {
  const pendingRef = db.collection('users').doc(uid).collection('pendingTransactions').doc(pendingId);
  const pendingDoc = await pendingRef.get();
  if (!pendingDoc.exists) {
    return sendMessage(chatId, "❌ Transação pendente não encontrada ou já processada.");
  }
  const pending = pendingDoc.data();
  
  const CATEGORY_LABELS = {
    liberdade: '💎 Liberdade',
    custos_fixos: '🏠 Custos Fixos',
    conforto: '🛋 Conforto',
    metas: '🎯 Metas',
    prazeres: '🎉 Prazeres',
    conhecimento: '📚 Conhecimento'
  };
  
  const catLabel = CATEGORY_LABELS[catId] || catId;
  const today = todayStrBrasilia();
  
  if (pending.tipo === 'saida') {
    await db.collection('transactions').doc(uid).collection('entries').add({
      tipo: 'saida',
      frequencia: 'unico',
      descricao: pending.descricao,
      valor: pending.valor,
      dataInicio: pending.dataCompra || today,
      categoria: catId,
      carteiraId: pending.carteiraId || null,
      conferido: true,
      via: 'webhook'
    });
  } else if (pending.tipo === 'cartao') {
    const cardId = pending.cartaoId;
    const cardRef = db.collection('cards').doc(uid).collection('list').doc(cardId);
    const cardDoc = await cardRef.get();
    if (!cardDoc.exists) {
      throw new Error("Cartão correspondente não encontrado.");
    }
    const card = cardDoc.data();
    
    const purchaseDate = pending.dataCompra || today;
    const proximoVenc = getProximoVencimentoBot(card, purchaseDate);
    
    const txsSnap = await db.collection('transactions').doc(uid).collection('entries')
      .where('tipo', '==', 'cartao')
      .where('cartaoId', '==', cardId)
      .where('dataInicio', '==', proximoVenc)
      .limit(1)
      .get();
      
    const newItem = {
      descricao: pending.descricao,
      valor: pending.valor,
      categoria: catId,
      dataCompra: purchaseDate,
      isParcelado: false
    };
    
    if (!txsSnap.empty) {
      const invoiceDoc = txsSnap.docs[0];
      const invoice = invoiceDoc.data();
      const currentItens = Array.isArray(invoice.itens) ? invoice.itens : [];
      const updatedItens = [...currentItens, newItem];
      const newTotal = updatedItens.reduce((sum, item) => sum + (Number(item.valor) || 0), 0);
      
      await invoiceDoc.ref.update({
        itens: updatedItens,
        valor: newTotal
      });
    } else {
      await db.collection('transactions').doc(uid).collection('entries').add({
        tipo: 'cartao',
        frequencia: 'unico',
        descricao: `Fatura - ${card.nome}`,
        valor: pending.valor,
        dataInicio: proximoVenc,
        categoria: null,
        dataFim: null,
        itens: [newItem],
        cartaoId: cardId,
        conferido: false
      });
    }
  }
  
  await pendingRef.delete();
  
  const okText = `✅ *Gasto de ${formatBRL(pending.valor)} no "${pending.descricao}" salvo em ${catLabel}!*`;
  await tgFetch('editMessageText', {
    chat_id: chatId,
    message_id: msgId,
    text: okText,
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [] }
  });
}

async function handleIgnorePendingTx(chatId, uid, pendingId, msgId) {
  const pendingRef = db.collection('users').doc(uid).collection('pendingTransactions').doc(pendingId);
  const pendingDoc = await pendingRef.get();
  if (pendingDoc.exists) {
    const pending = pendingDoc.data();
    await pendingRef.delete();
    const ignoreText = `❌ *Gasto de ${formatBRL(pending.valor)} no "${pending.descricao}" ignorado.*`;
    await tgFetch('editMessageText', {
      chat_id: chatId,
      message_id: msgId,
      text: ignoreText,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [] }
    });
  } else {
    await tgFetch('editMessageText', {
      chat_id: chatId,
      message_id: msgId,
      text: `❌ *Gasto ignorado.*`,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [] }
    });
  }
}

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

// ─── Onboarding v2 — máquina de estados com personalização completa ──────────

// Sentinela para resposta inválida (distingue de `false` que é resposta válida)
const INVALID = Symbol('invalid');

const SIM_NAO_KB = {
  keyboard:          [[{ text: '✅ Sim' }, { text: '❌ Não' }]],
  resize_keyboard:   true,
  one_time_keyboard: true,
};

function parseSN(text) {
  const t = text.trim().toLowerCase();
  if (/^(sim|s|yes|✅ sim|ok|quero|ativo|ativa|claro|pode|bora)$/.test(t)) return true;
  if (/^(não|nao|n|no|❌ não|nop|não quero|não preciso|deixa|pula)$/.test(t)) return false;
  return INVALID;
}

// Cada passo: msg(), kb, parse(text)→valor|INVALID, apply(data,val), next(data,val)→stepId|null
// Passos com mainStep são os "principais" (têm número de etapa exibido)
const STEPS = {

  horario: {
    mainStep: 1,
    msg: () =>
      `📍 *Etapa 1 de 6 — Horário dos alertas*\n\n` +
      `A que horas você prefere receber notificações e resumos diários?\n\n` +
      `_(Pode alterar depois em Configurações → Bot do Telegram no app)_`,
    kb: {
      keyboard: [
        [{ text: '🌅 7h — Manhã'  }],
        [{ text: '☀️ 12h — Tarde' }],
        [{ text: '🌙 19h — Noite' }],
      ],
      resize_keyboard: true, one_time_keyboard: true,
    },
    parse(text) {
      // Palavra ou número INTEIRO (7, 07h, 12h, 19...): "17h" não vira 7h (o 7 de 17 não conta)
      if (/manhã|manha/i.test(text)) return 7;
      if (/tarde/i.test(text))        return 12;
      if (/noite/i.test(text))        return 19;
      const n = text.match(/(?<!\d)(07|7|12|19)(?!\d)/);
      return n ? Number(n[1]) : INVALID;
    },
    apply(data, val) { data.horaAlerta = val; },
    next: () => 'cartoes',
    invalid: () => `Por favor, escolha um dos horários acima 👇`,
  },

  cartoes: {
    mainStep: 2,
    msg: () =>
      `📍 *Etapa 2 de 6 — Alertas de cartão de crédito*\n\n` +
      `Posso te avisar quando:\n` +
      `• Uma fatura estiver próxima do vencimento\n` +
      `• A fatura estiver prestes a fechar (2 dias antes)\n\n` +
      `Ativar alertas de cartão?`,
    kb: SIM_NAO_KB,
    parse: parseSN,
    apply(data, val) {
      data.tipos        = data.tipos || {};
      data.tipos.n1     = val;
      data.tipos.n2     = val;
      data.tipos.n3     = val;
    },
    next: (data, val) => val ? 'cartoes_aviso' : 'orcamento',
  },

  cartoes_aviso: {
    multiselect: true,
    defaultSelection: [3],
    msg: (sel = []) => {
      const lista = sel.length > 0
        ? `\n\n_Selecionado: ${[...sel].sort((a,b)=>a-b).map(n=>`*${n} dia${n>1?'s':''}*`).join(', ')} antes_`
        : `\n\n_Nenhum selecionado ainda._`;
      return `📅 *Com quantos dias de antecedência avisar sobre o vencimento?*\n_Pode escolher mais de um — toque para marcar/desmarcar._${lista}`;
    },
    buildKb(sel) {
      const mark = (v, label) => ({ text: sel.includes(v) ? `✅ ${label}` : label });
      return {
        keyboard: [
          [mark(1,'1 dia antes'),  mark(3,'3 dias antes')],
          [mark(5,'5 dias antes'), mark(7,'7 dias antes')],
          [{ text: '☑️ Confirmar seleção' }],
        ],
        resize_keyboard: true,
      };
    },
    parseOption(text) {
      const n = parseInt(text.replace(/^✅\s*/,'').trim());
      return [1,3,5,7].includes(n) ? n : null;
    },
    apply(data, val) { data.diasAntecedenciaVencimento = val; },
    next: () => 'orcamento',
  },

  orcamento: {
    mainStep: 3,
    msg: () =>
      `📍 *Etapa 3 de 6 — Alertas de orçamento*\n\n` +
      `Posso te avisar quando uma categoria (Divisão Percentual) atingir 80% do limite ou ultrapassá-lo.\n\n` +
      `Ativar alertas de orçamento?`,
    kb: SIM_NAO_KB,
    parse: parseSN,
    apply(data, val) {
      data.tipos        = data.tipos || {};
      data.tipos.n4     = val;
      data.tipos.n5     = val;
    },
    next: () => 'saldo_neg',
  },

  saldo_neg: {
    mainStep: 4,
    msg: () =>
      `📍 *Etapa 4 de 6 — Alerta de saldo negativo*\n\n` +
      `Posso te avisar quando a projeção indicar que seu saldo pode ficar negativo nos próximos 7 dias.\n\n` +
      `Ativar esse alerta?`,
    kb: SIM_NAO_KB,
    parse: parseSN,
    apply(data, val) {
      data.tipos        = data.tipos || {};
      data.tipos.n6     = val;
    },
    next: () => 'semanal',
  },

  semanal: {
    mainStep: 5,
    msg: () =>
      `📍 *Etapa 5 de 6 — Resumo semanal*\n\n` +
      `Posso enviar um resumo semanal com entradas, saídas e saldo da semana.\n\n` +
      `Ativar resumo semanal?`,
    kb: SIM_NAO_KB,
    parse: parseSN,
    apply(data, val) {
      data.tipos        = data.tipos || {};
      data.tipos.n7     = val;
    },
    next: (data, val) => val ? 'semanal_dia' : 'diario',
  },

  semanal_dia: {
    multiselect: true,
    defaultSelection: [1],
    _map: {
      'segunda-feira':1,'segunda':1,'seg':1,
      'terça-feira':2,'terca-feira':2,'terça':2,'terca':2,'ter':2,
      'quarta-feira':3,'quarta':3,'qua':3,
      'quinta-feira':4,'quinta':4,'qui':4,
      'sexta-feira':5,'sexta':5,'sex':5,
      'sábado':6,'sabado':6,'sáb':6,'sab':6,
      'domingo':0,'dom':0,
    },
    _nomes: ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'],
    msg(sel = []) {
      const lista = sel.length > 0
        ? `\n\n_Selecionado: ${[...sel].sort((a,b)=>a-b).map(v=>this._nomes[v]).join(', ')}_`
        : `\n\n_Nenhum selecionado ainda._`;
      return `📆 *Em quais dias da semana enviar o resumo semanal?*\n_Pode escolher mais de um._${lista}`;
    },
    buildKb(sel) {
      const d = (v, label) => ({ text: sel.includes(v) ? `✅ ${label}` : label });
      return {
        keyboard: [
          [d(1,'Segunda-feira'), d(2,'Terça-feira')],
          [d(3,'Quarta-feira'),  d(4,'Quinta-feira')],
          [d(5,'Sexta-feira'),   d(6,'Sábado'), d(0,'Domingo')],
          [{ text: '☑️ Confirmar seleção' }],
        ],
        resize_keyboard: true,
      };
    },
    parseOption(text) {
      const key = text.replace(/^✅\s*/,'').trim().toLowerCase();
      return key in this._map ? this._map[key] : null;
    },
    apply(data, val) { data.diaSemanaResumo = val; },
    next: () => 'diario',
  },

  diario: {
    mainStep: 6,
    msg: () =>
      `📍 *Etapa 6 de 6 — Resumo diário*\n\n` +
      `Posso enviar um resumo diário no horário que você escolheu com seu saldo atual e os lançamentos do dia.\n\n` +
      `Ativar resumo diário?`,
    kb: SIM_NAO_KB,
    parse: parseSN,
    apply(data, val) {
      data.tipos        = data.tipos || {};
      data.tipos.n8     = val;
    },
    next: (data, val) => val ? 'diario_dias' : null,
  },

  diario_dias: {
    msg: () => `🗓 *Quais dias você quer receber o resumo diário?*`,
    kb: {
      keyboard: [
        [{ text: '🗓 Todo dia'                    }],
        [{ text: '💼 Dias úteis (Seg–Sex)'        }],
        [{ text: '😎 Final de semana (Sáb e Dom)' }],
      ],
      resize_keyboard: true, one_time_keyboard: true,
    },
    parse(text) {
      const t = text.toLowerCase();
      if (/todo dia|todos/i.test(t))                           return 'todos';
      if (/úteis|uteis|seg|sex|dias úteis|dias uteis/i.test(t)) return 'uteis';
      if (/final|fim|sáb|sab|dom|semana/i.test(t))             return 'fds';
      return INVALID;
    },
    apply(data, val) { data.diasResumoDiario = val; },
    next: () => null, // concluído
    invalid: () => `Escolha uma das opções abaixo 👇`,
  },
};

// Envia a pergunta de uma etapa (suporta multi-select com seleção atual)
async function sendOnboardingQuestion(chatId, stepId, data = {}) {
  const step = STEPS[stepId];
  const sel  = step.multiselect ? (Array.isArray(data.tempSelections) ? data.tempSelections : []) : [];
  const msg  = step.multiselect ? step.msg(sel) : step.msg();
  const kb   = step.multiselect ? step.buildKb(sel) : step.kb;
  return sendMessage(chatId, msg, { reply_markup: kb });
}

// Exibe resumo e salva ao concluir todas as etapas
async function completeOnboarding(chatId, uid, dataBruta) {
  const { tempSelections: _sobra, ...data } = dataBruta || {};
  await db.collection('users').doc(uid).update({
    telegramOnboarding: FieldValue.delete(),
  });
  // As respostas sim/não valem para o canal TELEGRAM (notificacoes.telegramTipos), que é o que o agendador usa
  // quando existe. Antes iam para notificacoes.tipos (o do push): responder "não" aqui desligava alertas do push
  // e, para quem já tinha telegramTipos configurado no app, não valia para o Telegram.
  // Parte do que o Telegram já usa (telegramTipos, ou tipos se ainda não houver) para não perder as outras escolhas.
  const cfgDoc = await db.collection('config').doc(uid).get();
  const notifAtual = (cfgDoc.exists ? cfgDoc.data().notificacoes : null) || {};
  const baseTelegram = notifAtual.telegramTipos ?? notifAtual.tipos ?? {};
  const { tipos: respostas = {}, ...ajustes } = data;
  await db.collection('config').doc(uid).set(
    { notificacoes: { telegramEnabled: true, ...ajustes, telegramTipos: { ...baseTelegram, ...respostas } } },
    { merge: true }
  );

  const ativados   = Object.values(data.tipos || {}).filter(v => v === true).length;
  const NOME_HORA  = { 7: '7h (manhã)', 12: '12h (tarde)', 19: '19h (noite)' };
  const NOME_DIAS  = { todos: 'todo dia', uteis: 'dias úteis (Seg–Sex)', fds: 'fim de semana' };
  const NOMES_SEM  = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

  const fmtAnt = (v) => {
    const arr = Array.isArray(v) ? v : [v || 3];
    return arr.sort((a,b)=>a-b).map(n=>`${n}d`).join(', ') + ' antes';
  };
  const fmtSem = (v) => {
    const arr = Array.isArray(v) ? v : [v ?? 1];
    return arr.sort((a,b)=>a-b).map(x=>NOMES_SEM[x]).join(', ');
  };

  let resumo = `🎉 *Tudo configurado!*\n\n`;
  resumo += `🕐 Horário: *${NOME_HORA[data.horaAlerta] || '7h (manhã)'}*\n`;
  if (data.tipos?.n1) resumo += `💳 Alertas de cartão: ativados *(${fmtAnt(data.diasAntecedenciaVencimento)})*\n`;
  if (data.tipos?.n4) resumo += `💰 Alertas de orçamento: *ativados*\n`;
  if (data.tipos?.n6) resumo += `📉 Alerta de saldo negativo: *ativado*\n`;
  if (data.tipos?.n7) resumo += `📊 Resumo semanal: *${fmtSem(data.diaSemanaResumo)}*\n`;
  if (data.tipos?.n8) resumo += `🌅 Resumo diário: *${NOME_DIAS[data.diasResumoDiario] || 'todo dia'}*\n`;
  resumo += `\n✅ *${ativados} tipo(s) de alerta ativado(s)*\n\n`;
  resumo += `Use /ajuda para ver todos os comandos.\n`;
  resumo += `Para ajustar: *Configurações → Bot do Telegram* no app.`;

  return sendMessage(chatId, resumo, { reply_markup: { remove_keyboard: true } });
}

// Avança para o próximo passo (ou conclui)
async function advanceOnboarding(chatId, uid, nextId, data) {
  if (nextId === null) return completeOnboarding(chatId, uid, data);
  // mergeFields substitui o mapa inteiro; merge:true o mesclaria e deixaria sobras (ex.: tempSelections)
  await db.collection('users').doc(uid).set(
    { telegramOnboarding: { active: true, stepId: nextId, data } },
    { mergeFields: ['telegramOnboarding'] }
  );
  return sendOnboardingQuestion(chatId, nextId, data);
}

// Fluxo de multi-select: toggle de opções + confirmação
async function handleMultiSelectStep(chatId, uid, stepId, step, data, text) {
  const current  = Array.isArray(data.tempSelections) ? [...data.tempSelections] : [];
  const isPular  = /^\/(pular|skip)$/i.test(text.trim());
  const isConfirm = /confirmar|☑️/i.test(text);

  // /pular → usa seleção padrão definida no step
  if (isPular) {
    const defaultSel = step.defaultSelection || [1];
    const { tempSelections: _, ...cleanData } = data;
    step.apply(cleanData, defaultSel);
    return advanceOnboarding(chatId, uid, step.next(cleanData, defaultSel), cleanData);
  }

  // Confirmar seleção
  if (isConfirm) {
    if (current.length === 0) {
      return sendMessage(chatId,
        `Selecione pelo menos uma opção antes de confirmar 👇`,
        { reply_markup: step.buildKb(current) }
      );
    }
    const { tempSelections: _, ...cleanData } = data;
    step.apply(cleanData, current);
    return advanceOnboarding(chatId, uid, step.next(cleanData, current), cleanData);
  }

  // Toggle de opção
  const optVal = step.parseOption(text);
  if (optVal === null) {
    return sendMessage(chatId,
      `Toque nas opções para marcar/desmarcar, depois confirme 👇`,
      { reply_markup: step.buildKb(current) }
    );
  }

  const newSel = current.includes(optVal)
    ? current.filter(v => v !== optVal)
    : [...current, optVal];

  await db.collection('users').doc(uid).set(
    { telegramOnboarding: { active: true, stepId, data: { ...data, tempSelections: newSel } } },
    { mergeFields: ['telegramOnboarding'] }
  );

  return sendMessage(chatId, step.msg(newSel), { reply_markup: step.buildKb(newSel) });
}

async function startOnboarding(chatId, uid, email, fromUser) {
  await db.collection('users').doc(uid).set(
    { telegramOnboarding: { active: true, stepId: 'horario', data: {} } },
    { mergeFields: ['telegramOnboarding'] }
  );
  await sendMessage(chatId,
    `✅ *Conta vinculada com sucesso!*\n\n` +
    `Olá, *${fromUser?.first_name || 'usuário'}*! 🎉\n` +
    `Sua conta *${email}* está conectada ao Matoba Finanças.\n\n` +
    `Vou te fazer *6 perguntas* para configurar seus alertas do jeito que você prefere.\n\n` +
    `_(Tudo pode ser ajustado a qualquer momento em Configurações → Bot do Telegram no app)_`
  );
  return sendOnboardingQuestion(chatId, 'horario', {});
}

async function handleOnboardingStep(chatId, uid, onboarding, text) {
  const stepId = onboarding.stepId;
  const step   = STEPS[stepId];
  const data   = { ...(onboarding.data || {}) };

  if (!step) return startOnboarding(chatId, uid, '', {});

  // Rota multi-select para handler especializado
  if (step.multiselect) {
    return handleMultiSelectStep(chatId, uid, stepId, step, data, text);
  }

  // Passos single-value (Sim/Não, hora, dias…)
  const isPular = /^\/(pular|skip)$/i.test(text.trim());
  let val;
  if (isPular) {
    val = step.parse(step.kb.keyboard[0][0].text);
    if (val === INVALID) val = true;
  } else {
    val = step.parse(text);
  }

  if (val === INVALID) {
    const hint = step.invalid?.() || `Resposta não reconhecida. Tente novamente 👇`;
    return sendMessage(chatId,
      `${hint}\n\n_(Digite /pular para pular com o valor padrão)_`,
      { reply_markup: step.kb }
    );
  }

  step.apply(data, val);
  const nextId = step.next ? step.next(data, val) : null;
  return advanceOnboarding(chatId, uid, nextId, data);
}

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
