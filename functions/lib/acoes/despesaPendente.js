'use strict';

const { db } = require('../infra/firebase');
const { sendMessage, tgFetch } = require('../infra/telegram');
const { getProximoVencimentoBot } = require('../motor/caixa');
const { todayStrBrasilia } = require('../util/datas');
const { formatBRL, parseBRL } = require('../util/formato');

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

module.exports = { parseBankNotification, findSuggestedCategory, matchCardByName, matchWalletByName, handleConfirmPendingTx, handleIgnorePendingTx };
