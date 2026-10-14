'use strict';

const { db } = require('../infra/firebase');
const { sendMessage } = require('../infra/telegram');
const { calcFaturaCardApp } = require('../motor/caixa');
const { calcParceladosBot } = require('../motor/parcelados');
const { dateStrFromDate, getNowBrasilia, todayStrBrasilia } = require('../util/datas');
const { formatBRL } = require('../util/formato');

async function handleFatura(chatId, uid) {
  const agora = getNowBrasilia();
  const today = dateStrFromDate(agora);

  const cardsSnap = await db.collection('cards').doc(uid).collection('list').get();
  const cards = cardsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (cards.length === 0) {
    return sendMessage(chatId, '💳 Nenhum cartão cadastrado.');
  }

  const txSnap = await db.collection('transactions').doc(uid).collection('entries').get();
  const txs    = txSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  let text = `🧾 *Detalhamento das Faturas*\n\n`;

  for (const card of cards) {
    const { faturaAtual, comprometidoFuturo, proximoVenc, ocorrencias } = calcFaturaCardApp(card, txs, today);

    // Itens da fatura do ciclo: o que o app conta no vencimento (lançamento real ou parcelas projetadas)
    const items = [];
    let isVirtual = false;
    for (const o of ocorrencias) {
      if (String(o.tx.id || '').includes('-proj-')) isVirtual = true;
      if (o.tx.itens?.length > 0) o.tx.itens.forEach(item => items.push(item));
      else items.push({ descricao: o.tx.descricao || 'Despesa Cartão', valor: o.valor, dataCompra: o.tx.dataInicio });
    }

    const [pvy, pvm, pvd] = proximoVenc.split('-');
    const vencLabel = `${pvd}/${pvm}/${pvy}`;
    text += `💳 *${card.nome}* — vence ${vencLabel}\n`;
    text += `Fatura: *${formatBRL(faturaAtual)}*`;
    if (comprometidoFuturo > 0) text += ` _(+ ${formatBRL(comprometidoFuturo)} futuro)_`;
    if (card.limite > 0) text += ` · Disponível: *${formatBRL(Math.max(0, card.limite - faturaAtual - comprometidoFuturo))}*`;
    text += '\n';

    if (items.length > 0) {
      if (isVirtual) text += `_Parcelas projetadas:_\n`;
      else text += `_Lançamentos:_\n`;
      items.sort((a,b) => (a.dataCompra || '').localeCompare(b.dataCompra || '')).forEach(item => {
        const dia = item.dataCompra ? item.dataCompra.split('-')[2] : '–';
        const parc = (item.isParcelado || (item.parcelaAtual && item.totalParcelas))
          ? ` (${item.parcelaAtual}/${item.totalParcelas}x)` : '';
        text += ` • ${dia} · ${item.descricao || 'Despesa'}${parc}: *${formatBRL(item.valor)}*\n`;
      });
    } else {
      text += `_Nenhum lançamento neste ciclo._\n`;
    }
    text += `\n`;
  }

  return sendMessage(chatId, text.trim());
}

async function handleParcelados(chatId, uid) {
  const [txSnap, cardsSnap] = await Promise.all([
    db.collection('transactions').doc(uid).collection('entries').get(),
    db.collection('cards').doc(uid).collection('list').get(),
  ]);
  const txs     = txSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const cards   = cardsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const cardMap = Object.fromEntries(cards.map(c => [c.id, c]));

  const { cartaoItems, avulsos } = calcParceladosBot(txs, todayStrBrasilia());

  if (cartaoItems.length === 0 && avulsos.length === 0) {
    return sendMessage(chatId,
      `🎉 *Nenhuma compra parcelada em aberto!*\n_Você está livre de dívidas parceladas._`
    );
  }

  let text  = `📋 *Compras Parceladas em Aberto*\n\n`;
  let totalGeral = 0;

  // ── Itens de cartão agrupados por cartão ─────────────────────────────────
  const byCard = {};
  cartaoItems.forEach(p => {
    (byCard[p.cartaoId] = byCard[p.cartaoId] || []).push(p);
  });

  for (const [cardId, items] of Object.entries(byCard)) {
    const nome = cardMap[cardId]?.nome || 'Cartão';
    text += `💳 *${nome}*\n`;
    // ordena por valor total restante decrescente
    items.sort((a, b) => b.totalRestante - a.totalRestante);
    for (const p of items) {
      const { restam, totalRestante } = p;
      totalGeral += totalRestante;
      const ultimaTag = restam === 1 ? ' ⚡ _última!_' : '';
      text += ` • *${p.descricao}* _(${p.parcelaAtual}/${p.totalParcelas}x)_${ultimaTag}\n`;
      text += `   ${formatBRL(p.valor)}/mês × ${restam} restantes = *${formatBRL(totalRestante)}*\n`;
    }
    text += '\n';
  }

  // ── Parcelados avulsos ────────────────────────────────────────────────────
  if (avulsos.length > 0) {
    text += `📦 *Parcelados Avulsos*\n`;
    avulsos.sort((a, b) => b.totalRestante - a.totalRestante);
    for (const p of avulsos) {
      const { restam, totalRestante } = p;
      totalGeral += totalRestante;
      const ultimaTag = restam === 1 ? ' ⚡ _última!_' : '';
      text += ` • *${p.descricao}* _(${p.parcelaAtual}/${p.totalParcelas}x)_${ultimaTag}\n`;
      text += `   ${formatBRL(p.valor)}/mês × ${restam} restantes = *${formatBRL(totalRestante)}*\n`;
    }
    text += '\n';
  }

  text += `─────────────────\n`;
  text += `💸 *Total ainda a pagar: ${formatBRL(totalGeral)}*`;

  return sendMessage(chatId, text.trim());
}

module.exports = { handleFatura, handleParcelados };
