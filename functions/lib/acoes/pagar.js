'use strict';

const { loadUserData } = require('../infra/dados');
const { db } = require('../infra/firebase');
const { expandRange } = require('../motor/caixa');
const { itensDoLancamentoRealBot, ocorrenciaProjetada } = require('../motor/faturaProjetada');
const { addDaysFn, todayStrBrasilia } = require('../util/datas');

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

module.exports = { handlePayCallback, handlePayCardCallback, handlePostponeCallback };
