'use strict';

const { loadUserData } = require('../infra/dados');
const { db } = require('../infra/firebase');
const { APP_URL, sendMessage } = require('../infra/telegram');
const { calcSaldoSimples, cartaoComFaturaRealNoMes, expandRange, getProximoVencimentoBot } = require('../motor/caixa');
const { CATEGORY_ORDER, collectMonthExpenses, computeSpentByCategory, getTopExpensesForCategory } = require('../motor/competencia');
const { ehResgateBot } = require('../motor/investido');
const { dateStrFromDate, getNowBrasilia, todayStrBrasilia } = require('../util/datas');
const { MESES_CURTO, MESES_LONGO, barra, formatBRL, parseBRL } = require('../util/formato');

async function handleSaldo(chatId, uid) {
  const today = todayStrBrasilia();
  const { transactions, walletInitials } = await loadUserData(uid);
  const saldo = calcSaldoSimples(transactions, today, walletInitials);

  // Detalhamento por tipo de saldo
  const walletSnap = await db.collection('wallets').where('userId', '==', uid).get();
  const wallets    = walletSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  let msg = saldo >= 0
    ? `💰 *Saldo Global:* ${formatBRL(saldo)} ✅`
    : `💰 *Saldo Global:* ${formatBRL(saldo)} ⚠️`;

  if (wallets.length > 0) {
    msg += '\n\n📂 *Por carteira:*\n';
    for (const w of wallets) {
      const wTxs   = transactions.filter(t => t.carteiraId === w.id);
      const wSaldo = (parseBRL(w.saldoInicial) || 0) + calcSaldoSimples(wTxs, today, 0);
      msg += `• ${w.nome}: *${formatBRL(wSaldo)}*\n`;
    }
  }

  return sendMessage(chatId, msg.trim());
}

async function handleResumo(chatId, uid) {
  const now     = getNowBrasilia();
  const month   = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const from    = `${month}-01`;
  const lastDay = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
  const to      = `${month}-${String(lastDay).padStart(2,'0')}`;

  const { transactions } = await loadUserData(uid);
  const comFaturaReal = cartaoComFaturaRealNoMes(transactions, from, to);
  const occs = expandRange(transactions, from, to);

  let entradas = 0, saidas = 0;
  for (const o of occs) {
    if (o.tx?.id?.includes('-proj-') && comFaturaReal.has(o.tx?.cartaoId)) continue;
    if (ehResgateBot(o.tx)) { /* resgate: não é receita nem gasto */ } else if (o.tipo === 'entrada') entradas += o.valor;
    else                      saidas   += o.valor;
  }

  // Gastos = quando aconteceram (compra/parcela); Saiu do caixa = quando a fatura/conta foi debitada
  const gastos = collectMonthExpenses(transactions, month).reduce((s, e) => s + e.valor, 0);

  const nomeMes = now.toLocaleString('pt-BR', { month: 'long', timeZone: 'America/Sao_Paulo' });
  return sendMessage(chatId,
    `📊 *Resumo de ${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)}*\n\n` +
    `✅ Entradas: *${formatBRL(entradas)}*\n` +
    `❌ Gastos:   *${formatBRL(gastos)}*\n` +
    `💰 Resultado: *${formatBRL(entradas - gastos)}*\n\n` +
    `🏦 Saiu do caixa: ${formatBRL(saidas)}\n` +
    `_Gastos = quando a compra aconteceu (parcelas mês a mês). Saiu do caixa = quando a conta/fatura foi paga._`
  );
}

async function handleCartoes(chatId, uid) {
  const snap = await db.collection('cards').doc(uid).collection('list').get();
  const cards = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (cards.length === 0) {
    return sendMessage(chatId, '💳 Nenhum cartão cadastrado.');
  }

  const todayStr = todayStrBrasilia();
  let text = '💳 *Seus cartões:*\n\n';
  for (const c of cards) {
    const proximoVenc = getProximoVencimentoBot(c, todayStr);
    const diasVenc = Math.round(
      (new Date(proximoVenc + 'T00:00:00') - new Date(todayStr + 'T00:00:00')) / 86400000
    );
    const urgente = diasVenc === 0 ? ' 🚨 vence HOJE' : diasVenc <= 3 ? ` ⚠️ vence em ${diasVenc}d` : '';
    text += `• *${c.nome}*${urgente}\n  Vence dia ${c.diaVencimento} · Fecha dia ${c.diaFechamento} · Limite ${formatBRL(c.limite)}\n\n`;
  }

  return sendMessage(chatId, text.trim());
}

// Mensagem padrão quando usuário tenta adicionar/editar via bot
function msgSomenteApp(chatId) {
  return sendMessage(chatId,
    `📱 *Use o aplicativo para isso!*\n\n` +
    `Para adicionar, editar ou excluir lançamentos acesse:\n` +
    `👉 ${APP_URL}\n\n` +
    `O bot é voltado apenas para *consultas e alertas*.\n` +
    `Use /ajuda para ver o que está disponível aqui.`
  );
}

// ─── Handlers de consulta ─────────────────────────────────────────────────────

async function handleHoje(chatId, uid) {
  const hoje  = todayStrBrasilia();
  const { transactions } = await loadUserData(uid);
  // Expande todas as ocorrências do dia (unico, recorrentes, parcelados, diario)
  const occs  = expandRange(transactions, hoje, hoje)
    .sort((a, b) => (a.tipo === 'entrada' ? 0 : 1) - (b.tipo === 'entrada' ? 0 : 1));

  const label = hoje.split('-').reverse().join('/');
  let entradas = 0, saidas = 0;
  let text = `📅 *Hoje — ${label}*\n\n`;

  if (occs.length === 0) {
    text += '_Nenhum lançamento para hoje._\n\n';
  } else {
    for (const o of occs) {
      const sign = o.tipo === 'entrada' ? '+' : '-';
      const icon = o.tipo === 'entrada' ? '✅' : '❌';
      // o.tx já contém a transação original — não precisa de find()
      const desc = o.tx?.descricao || o.tipo;
      const freqTag = o.tx?.frequencia === 'mensal' ? ' 🔄' :
                      o.tx?.frequencia === 'semanal' ? ' 🔄' :
                      o.tx?.frequencia === 'parcelado' ? ` (${o.tx.parcelaAtual}/${o.tx.totalParcelas}x)` :
                      o.tx?.tipo === 'diario' ? ' (diário)' : '';
      // Conferido?
      const isConf = o.tx?.frequencia === 'unico' || o.tx?.frequencia === 'parcelado'
        ? !!o.tx?.conferido
        : !!(o.tx?.conferidos && o.tx.conferidos.includes(o.date));
      const confTag = isConf ? ' ✔️' : ' ⏳';
      text += `${icon} ${desc}${freqTag}${confTag}: *${sign}${formatBRL(o.valor)}*\n`;
      if (ehResgateBot(o.tx)) { /* resgate: não é receita nem gasto */ } else if (o.tipo === 'entrada') entradas += o.valor; else saidas += o.valor;
    }
    text += `\n─────────────────\n`;
    if (entradas > 0) text += `✅ Entradas: *${formatBRL(entradas)}*\n`;
    if (saidas   > 0) text += `❌ Saídas:   *${formatBRL(saidas)}*\n`;
    text += `💰 Saldo do dia: *${formatBRL(entradas - saidas)}*`;
  }

  return sendMessage(chatId, text.trim());
}

async function handleHistorico(chatId, uid) {
  const snap = await db.collection('transactions').doc(uid).collection('entries').get();
  const txs  = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Mostra apenas lançamentos únicos/parcelados (os recorrentes são regras, não eventos)
  const individuais = txs
    .filter(tx => tx.frequencia === 'unico' || tx.frequencia === 'parcelado')
    .sort((a, b) => b.dataInicio > a.dataInicio ? 1 : b.dataInicio < a.dataInicio ? -1 : 0)
    .slice(0, 10);

  if (individuais.length === 0) {
    return sendMessage(chatId, '📋 Nenhum lançamento encontrado.');
  }

  let text = `📋 *Últimos ${individuais.length} lançamentos*\n\n`;
  for (const tx of individuais) {
    const v    = Number(tx.valor) || 0;
    const sign = tx.tipo === 'entrada' ? '+' : '-';
    const icon = tx.tipo === 'entrada' ? '✅' : '❌';
    const data = tx.dataInicio.split('-').reverse().join('/');
    const desc = tx.descricao || tx.tipo;
    const parc = tx.frequencia === 'parcelado' ? ` (${tx.parcelaAtual}/${tx.totalParcelas}x)` : '';
    text += `${icon} ${data} · ${desc}${parc}: *${sign}${formatBRL(v)}*\n`;
  }

  return sendMessage(chatId, text.trim());
}

async function handleSemana(chatId, uid) {
  const agora   = getNowBrasilia();
  const hoje    = dateStrFromDate(agora);
  const d7      = new Date(agora); d7.setDate(agora.getDate() - 6);
  const fromStr = dateStrFromDate(d7);

  const { transactions } = await loadUserData(uid);
  const comFaturaRealSem = cartaoComFaturaRealNoMes(transactions, fromStr, hoje);
  const occs = expandRange(transactions, fromStr, hoje, { historical: true });

  let entradas = 0, saidas = 0;
  const byDay = {};

  for (const o of occs) {
    if (o.tx?.id?.includes('-proj-') && comFaturaRealSem.has(o.tx?.cartaoId)) continue;
    if (!byDay[o.date]) byDay[o.date] = { e: 0, s: 0 };
    if (ehResgateBot(o.tx)) { /* resgate: não é receita nem gasto */ } else if (o.tipo === 'entrada') { entradas += o.valor; byDay[o.date].e += o.valor; }
    else                      { saidas   += o.valor; byDay[o.date].s += o.valor; }
  }

  const maxSaida = Math.max(...Object.values(byDay).map(d => d.s), 1);

  let text = `📆 *Resumo dos últimos 7 dias*\n\n`;
  for (let i = 6; i >= 0; i--) {
    const dt  = new Date(agora); dt.setDate(agora.getDate() - i);
    const ds  = dateStrFromDate(dt);
    const d   = byDay[ds] || { e: 0, s: 0 };
    const { bar } = barra(d.s, maxSaida, 8);
    const label   = ds.slice(8, 10) + '/' + ds.slice(5, 7);
    const marker  = ds === hoje ? '›' : ' ';
    text += `${marker} ${label} \`[${bar}]\` ${d.s > 0 ? formatBRL(d.s) : '–'}\n`;
  }

  text += `\n─────────────────\n`;
  text += `✅ Entradas: *${formatBRL(entradas)}*\n`;
  text += `❌ Saídas:   *${formatBRL(saidas)}*\n`;
  text += `💰 Saldo:    *${formatBRL(entradas - saidas)}*`;

  return sendMessage(chatId, text.trim());
}

async function handleMes(chatId, uid, args) {
  const agora = getNowBrasilia();
  let year  = agora.getFullYear();
  let month = agora.getMonth() + 1;

  if (args) {
    const n = parseInt(args.trim());
    if (n >= 1 && n <= 12) month = n;
  }

  const mesStr  = `${year}-${String(month).padStart(2, '0')}`;
  const from    = `${mesStr}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to      = `${mesStr}-${String(lastDay).padStart(2, '0')}`;

  const { transactions } = await loadUserData(uid);
  const comFaturaReal = cartaoComFaturaRealNoMes(transactions, from, to);
  const occs = expandRange(transactions, from, to);

  let entradas = 0, saidas = 0;
  for (const o of occs) {
    if (o.tx?.id?.includes('-proj-') && comFaturaReal.has(o.tx?.cartaoId)) continue;
    if (ehResgateBot(o.tx)) { /* resgate: não é receita nem gasto */ } else if (o.tipo === 'entrada') entradas += o.valor;
    else                      saidas   += o.valor;
  }

  // Gastos = quando aconteceram (compra/parcela); Saiu do caixa = quando a fatura/conta foi debitada
  const gastos = collectMonthExpenses(transactions, mesStr).reduce((s, e) => s + e.valor, 0);

  const nomeMes = MESES_LONGO[month];
  const saldo   = entradas - gastos;

  let text = `📊 *${nomeMes} ${year}*\n\n`;
  text += `✅ Entradas: *${formatBRL(entradas)}*\n`;
  text += `❌ Gastos:   *${formatBRL(gastos)}*\n`;
  text += `💰 Resultado: *${formatBRL(saldo)}*\n\n`;
  text += `🏦 Saiu do caixa: ${formatBRL(saidas)}\n`;
  text += `_Use /categoria para ver a divisão por categoria._`;

  return sendMessage(chatId, text.trim());
}

async function handleCategoria(chatId, uid) {
  const agora = getNowBrasilia();
  const mesStr = `${agora.getFullYear()}-${String(agora.getMonth()+1).padStart(2,'0')}`;

  const configDoc = await db.collection('config').doc(uid).get();
  const config    = configDoc.exists ? configDoc.data() : {};
  const renda     = config.rendaMensal || 0;
  const pcts      = config.budgetPcts  || {};

  const txSnap = await db.collection('transactions').doc(uid).collection('entries').get();
  const txs    = txSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const spent  = computeSpentByCategory(txs, mesStr);

  const nomeMes = MESES_CURTO[agora.getMonth() + 1];

  const ICONS = {
    liberdade: '💎', custos_fixos: '🏠', conforto: '🛋',
    metas: '🎯', prazeres: '🎉', conhecimento: '📚',
  };
  const LABELS = {
    liberdade: 'Liberdade', custos_fixos: 'Custos Fixos', conforto: 'Conforto',
    metas: 'Metas', prazeres: 'Prazeres', conhecimento: 'Conhecimento',
  };

  let text = `📊 *Orçamento — ${nomeMes}*\n\n`;

  for (const catId of CATEGORY_ORDER) {
    const budget = renda > 0 ? (renda * (Number(pcts[catId]) || 0)) / 100 : 0;
    const s      = spent[catId] || 0;
    const icon   = ICONS[catId] || '•';
    const label  = LABELS[catId] || catId;

    if (budget > 0) {
      const { bar, pct } = barra(s, budget);
      const status = pct > 100 ? ' ⚠️' : pct >= 80 ? ' ❕' : '';
      text += `${icon} *${label}*${status}\n`;
      text += `\`[${bar}] ${pct}%\`  ${formatBRL(s)} de ${formatBRL(budget)}\n`;
      if (s > 0) {
        const top = getTopExpensesForCategory(txs, catId, mesStr);
        if (top) text += `_(${top})_\n`;
      }
      text += `\n`;
    } else {
      text += `${icon} *${label}*: ${formatBRL(s)}\n`;
      if (s > 0) {
        const top = getTopExpensesForCategory(txs, catId, mesStr);
        if (top) text += `_(${top})_\n`;
      }
      text += `\n`;
    }
  }

  if (renda === 0) {
    text += `_Configure sua renda no app para ver as barras de progresso._`;
  }

  return sendMessage(chatId, text.trim());
}

async function handleMeta(chatId, uid) {
  const agora = getNowBrasilia();
  const mesStr = `${agora.getFullYear()}-${String(agora.getMonth()+1).padStart(2,'0')}`;

  const configDoc = await db.collection('config').doc(uid).get();
  const config    = configDoc.exists ? configDoc.data() : {};
  const renda     = config.rendaMensal || 0;
  const pcts      = config.budgetPcts  || {};

  if (renda <= 0) {
    return sendMessage(chatId,
      '🎯 Configure sua renda no aplicativo para acompanhar as metas.\n\n' +
      `👉 ${APP_URL}`
    );
  }

  const txSnap = await db.collection('transactions').doc(uid).collection('entries').get();
  const txs    = txSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const spent  = computeSpentByCategory(txs, mesStr);

  const diasNoMes  = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate();
  const diaAtual   = agora.getDate();
  const progMes    = (diaAtual / diasNoMes) * 100; // % do mês que já passou

  const LABELS = {
    liberdade: '💎 Liberdade', custos_fixos: '🏠 Custos Fixos', conforto: '🛋 Conforto',
    metas: '🎯 Metas', prazeres: '🎉 Prazeres', conhecimento: '📚 Conhecimento',
  };

  let text = `🎯 *Status das Metas — ${MESES_CURTO[agora.getMonth()+1]}*\n`;
  text += `_Mês ${Math.round(progMes)}% concluído (dia ${diaAtual}/${diasNoMes})_\n\n`;

  for (const catId of CATEGORY_ORDER) {
    const budget = (renda * (Number(pcts[catId]) || 0)) / 100;
    if (budget <= 0) continue;
    const s      = spent[catId] || 0;
    const restante = budget - s;
    const pct    = Math.round((s / budget) * 100);
    const label  = LABELS[catId];

    let status;
    if (pct > 100)       status = `🔴 Estourou em ${formatBRL(-restante)}`;
    else if (pct >= 80)  status = `⚠️ Restam apenas ${formatBRL(restante)}`;
    else if (pct >= progMes) status = `✅ No ritmo — restam ${formatBRL(restante)}`;
    else                 status = `✅ Restam ${formatBRL(restante)}`;

    text += `*${label}*\n${status} _(${pct}% usado)_\n\n`;
  }

  return sendMessage(chatId, text.trim());
}

module.exports = { handleSaldo, handleResumo, handleCartoes, msgSomenteApp, handleHoje, handleHistorico, handleSemana, handleMes, handleCategoria, handleMeta };
