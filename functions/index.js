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

const { onRequest }  = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger }     = require('firebase-functions');
const admin          = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// ─── Configuração ──────────────────────────────────────────────────────────────
const BOT_TOKEN   = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM    = `https://api.telegram.org/bot${BOT_TOKEN}`;
const PROJECT_ID  = process.env.GCLOUD_PROJECT || 'matobafinancas';
const REGION      = 'us-central1';

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

// ─── Helpers de data (fuso Brasília UTC-3) ────────────────────────────────────
function getNowBrasilia() {
  // Date em Brasília
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
}

function todayStrBrasilia() {
  const d = getNowBrasilia();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function dateStrFromDate(dt) {
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}

function formatBRL(n) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0);
}

// Barra de progresso ASCII — ex: [████████░░] 82%
function barra(valor, maximo, largura = 10) {
  const pct  = maximo > 0 ? valor / maximo : 0;
  const fill = Math.round(Math.min(pct, 1) * largura);
  const bar  = '█'.repeat(fill) + '░'.repeat(Math.max(0, largura - fill));
  return { bar, pct: maximo > 0 ? Math.round(pct * 100) : 0 };
}

const APP_URL = 'https://viniciusmatoba.github.io/matobafinancias/';

// ─── Cálculo de saldo simples ─────────────────────────────────────────────────
const TYPE_SIGN = { entrada: +1, saida: -1, diario: -1, cartao: -1, investimento: -1 };

function calcSaldoSimples(transactions, upTo) {
  let saldo = 0;
  for (const tx of transactions) {
    if (!tx.dataInicio || tx.dataInicio > upTo) continue;
    const sign = TYPE_SIGN[tx.tipo] ?? -1;
    const v    = Number(tx.valor) || 0;

    if (tx.frequencia === 'unico' || tx.frequencia === 'diario') {
      // diario: valor já dividido por 30, ignoramos projeções futuras aqui
      if (tx.dataInicio <= upTo) saldo += sign * v;
    } else if (tx.frequencia === 'mensal') {
      // conta todos os meses entre dataInicio e min(upTo, dataFim)
      const end = tx.dataFim && tx.dataFim < upTo ? tx.dataFim : upTo;
      let cur = new Date(tx.dataInicio + 'T00:00:00');
      while (dateStrFromDate(cur) <= end) {
        saldo += sign * v;
        cur.setMonth(cur.getMonth() + 1);
      }
    } else if (tx.frequencia === 'semanal') {
      let cur = new Date(tx.dataInicio + 'T00:00:00');
      const end = tx.dataFim && tx.dataFim < upTo ? tx.dataFim : upTo;
      while (dateStrFromDate(cur) <= end) {
        saldo += sign * v;
        cur.setDate(cur.getDate() + 7);
      }
    } else if (tx.frequencia === 'parcelado') {
      const total = tx.totalParcelas || 1;
      const start = tx.parcelaAtual  || 1;
      for (let i = 0; i < total - start + 1; i++) {
        const pd = new Date(tx.dataInicio + 'T00:00:00');
        pd.setMonth(pd.getMonth() + i);
        if (dateStrFromDate(pd) <= upTo) saldo += sign * v;
      }
    }
  }
  return saldo;
}

// ─── Gasto por categoria no mês corrente ─────────────────────────────────────
const CATEGORY_ORDER = ['liberdade','custos_fixos','conforto','metas','prazeres','conhecimento'];

function computeSpentByCategory(transactions, currentMonth) {
  const totals = Object.fromEntries(CATEGORY_ORDER.map(id => [id, 0]));
  const [year, mon] = currentMonth.split('-').map(Number);
  const from  = `${currentMonth}-01`;
  const to    = `${currentMonth}-${String(new Date(year, mon, 0).getDate()).padStart(2,'0')}`;

  for (const tx of transactions) {
    if (tx.tipo === 'cartao' && tx.itens?.length > 0) {
      for (const item of tx.itens) {
        const cat = item.categoria;
        if (!cat || !(cat in totals)) continue;
        if (item.isParcelado) {
          const start   = item.parcelaAtual || 1;
          const remaining = (item.totalParcelas || 1) - start + 1;
          for (let i = 0; i < remaining; i++) {
            const [y, m] = item.dataCompra.split('-').map(Number);
            const pd     = new Date(y, m - 1 + i, 1);
            const pMonth = `${pd.getFullYear()}-${String(pd.getMonth()+1).padStart(2,'0')}`;
            if (pMonth === currentMonth) totals[cat] += Number(item.valor) || 0;
          }
        } else if (item.dataCompra?.startsWith(currentMonth)) {
          totals[cat] += Number(item.valor) || 0;
        }
      }
    } else {
      if (!tx.dataInicio || tx.dataInicio < from || tx.dataInicio > to) continue;
      if (tx.tipo === 'entrada') continue;
      const cat = tx.categoria || (tx.tipo === 'investimento' ? 'liberdade' : null);
      if (cat && cat in totals) totals[cat] += Number(tx.valor) || 0;
    }
  }
  return totals;
}

// ─── Verificações de notificação (N1-N7) ────────────────────────────────────
function checkNotifications(cards, transactions, config, prefs) {
  const msgs  = [];
  const tipos = prefs?.tipos ?? {};
  const hoje  = getNowBrasilia();
  const day   = hoje.getDate();
  const weekday = hoje.getDay(); // 0=Dom 1=Seg
  const currentMonth = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
  const todayStr     = dateStrFromDate(hoje);

  // N1 — Fatura vence hoje
  if (tipos.n1 !== false) {
    for (const card of cards) {
      if (card.diaVencimento === day) {
        msgs.push(`💳 *Fatura vence hoje!*\n${card.nome} — não esqueça de efetuar o pagamento.`);
      }
    }
  }

  // N2 — Fatura vence em 3 dias
  if (tipos.n2 !== false) {
    const d3 = new Date(hoje); d3.setDate(d3.getDate() + 3);
    for (const card of cards) {
      if (card.diaVencimento === d3.getDate()) {
        msgs.push(`📅 *Fatura em 3 dias*\n${card.nome} vence no dia *${card.diaVencimento}*.`);
      }
    }
  }

  // N3 — Fatura fecha em 2 dias
  if (tipos.n3 !== false) {
    const d2 = new Date(hoje); d2.setDate(d2.getDate() + 2);
    for (const card of cards) {
      if (card.diaFechamento === d2.getDate()) {
        msgs.push(`⏰ *Fatura fecha em 2 dias*\n${card.nome} — últimos dias para compras nesta fatura!`);
      }
    }
  }

  // N4/N5 — Orçamento
  if (tipos.n4 !== false || tipos.n5 !== false) {
    const rendaMensal = config?.rendaMensal || 0;
    const budgetPcts  = config?.budgetPcts  || {};
    if (rendaMensal > 0) {
      const spent = computeSpentByCategory(transactions, currentMonth);
      const LABELS = {
        liberdade: 'Liberdade Financeira', custos_fixos: 'Custos Fixos',
        conforto: 'Conforto', metas: 'Metas', prazeres: 'Prazeres', conhecimento: 'Conhecimento',
      };
      for (const catId of CATEGORY_ORDER) {
        const budget = (rendaMensal * (Number(budgetPcts[catId]) || 0)) / 100;
        if (budget <= 0) continue;
        const s   = spent[catId] || 0;
        const pct = (s / budget) * 100;
        if (tipos.n5 !== false && pct > 100) {
          msgs.push(`🚨 *${LABELS[catId]} estourou!*\nGasto ${formatBRL(s)} de ${formatBRL(budget)} — excedeu em *${formatBRL(s - budget)}*.`);
        } else if (tipos.n4 !== false && pct >= 80 && pct <= 100) {
          msgs.push(`⚠️ *${LABELS[catId]} em ${Math.round(pct)}%*\n${formatBRL(s)} de ${formatBRL(budget)} utilizados este mês.`);
        }
      }
    }
  }

  // N6 — Saldo negativo projetado em 7 dias
  if (tipos.n6 !== false) {
    const saldoAtual = calcSaldoSimples(transactions, todayStr);
    const d7 = new Date(hoje); d7.setDate(d7.getDate() + 7);
    const in7 = dateStrFromDate(d7);

    let saidas7 = 0;
    for (const tx of transactions) {
      if (tx.tipo === 'entrada') continue;
      if (tx.frequencia === 'unico' && tx.dataInicio > todayStr && tx.dataInicio <= in7) {
        saidas7 += Number(tx.valor) || 0;
      } else if (tx.frequencia === 'mensal') {
        const pd = new Date(tx.dataInicio + 'T00:00:00');
        pd.setDate(hoje.getDate()); // próximo dia do mês
        const ds = dateStrFromDate(pd);
        if (ds > todayStr && ds <= in7) saidas7 += Number(tx.valor) || 0;
      }
    }

    const saldoProjetado = saldoAtual - saidas7;
    if (saldoProjetado < 0) {
      msgs.push(`📉 *Alerta: saldo pode ficar negativo!*\nSaldo atual ${formatBRL(saldoAtual)} · Saídas previstas ${formatBRL(saidas7)} · Projeção *${formatBRL(saldoProjetado)}* em 7 dias.`);
    }
  }

  // N7 — Resumo semanal (toda segunda-feira)
  if (tipos.n7 !== false && weekday === 1) {
    const d7ago = new Date(hoje); d7ago.setDate(d7ago.getDate() - 7);
    const fromStr = dateStrFromDate(d7ago);
    let entradas = 0, saidas = 0;
    for (const tx of transactions) {
      if (!tx.dataInicio || tx.dataInicio < fromStr || tx.dataInicio > todayStr) continue;
      if (tx.tipo === 'entrada') entradas += Number(tx.valor) || 0;
      else                       saidas   += Number(tx.valor) || 0;
    }
    msgs.push(`📊 *Resumo semanal*\n✅ Entradas: ${formatBRL(entradas)}\n❌ Saídas: ${formatBRL(saidas)}\n💰 Saldo da semana: *${formatBRL(entradas - saidas)}*`);
  }

  // N8 — Resumo diário matinal (ativado no onboarding pelo usuário)
  if (tipos.n8 === true) {
    const saldoAtual = calcSaldoSimples(transactions, todayStr);
    const lancHoje   = transactions.filter(tx =>
      tx.dataInicio === todayStr && tx.frequencia === 'unico'
    );

    const [, , dd] = todayStr.split('-');
    const nomeMesHoje = hoje.toLocaleString('pt-BR', { month: 'long', timeZone: 'America/Sao_Paulo' });
    let msg = `🌅 *Bom dia! Resumo de ${dd} de ${nomeMesHoje}*\n\n`;
    msg += `💰 Saldo atual: *${formatBRL(saldoAtual)}*\n\n`;

    if (lancHoje.length > 0) {
      let entH = 0, saiH = 0;
      msg += `📋 *Lançamentos de hoje:*\n`;
      for (const tx of lancHoje) {
        const v    = Number(tx.valor) || 0;
        const icon = tx.tipo === 'entrada' ? '✅' : '❌';
        const sign = tx.tipo === 'entrada' ? '+' : '-';
        msg += `${icon} ${tx.descricao || tx.tipo}: *${sign}${formatBRL(v)}*\n`;
        if (tx.tipo === 'entrada') entH += v; else saiH += v;
      }
      if (lancHoje.length > 1) msg += `_Saldo do dia: ${formatBRL(entH - saiH)}_\n\n`;
      else msg += '\n';
    } else {
      msg += `_Nenhum lançamento avulso para hoje._\n\n`;
    }

    // Inclui faturas só se N1 não estiver ativo (evitar duplicata)
    if (tipos.n1 !== true) {
      const fatHoje = cards.filter(c => c.diaVencimento === day);
      if (fatHoje.length > 0) {
        msg += `💳 *Fatura vencendo hoje:*\n`;
        for (const c of fatHoje) msg += `• ${c.nome}\n`;
        msg += '\n';
      }
    }

    msg += `_Bom dia e boas finanças! 🚀_`;
    msgs.push(msg.trim());
  }

  return msgs;
}

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
    telegramLinkedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  await linkDoc.ref.delete();

  return startOnboarding(chatId, uid, email, fromUser);
}

async function handleSaldo(chatId, uid) {
  const today = todayStrBrasilia();
  const snap  = await db.collection('transactions').doc(uid).collection('entries').get();
  const txs   = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const saldo = calcSaldoSimples(txs, today);

  const msg = saldo >= 0
    ? `💰 *Saldo atual:* ${formatBRL(saldo)} ✅`
    : `💰 *Saldo atual:* ${formatBRL(saldo)} ⚠️`;

  return sendMessage(chatId, msg);
}

async function handleResumo(chatId, uid) {
  const now    = getNowBrasilia();
  const month  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const from   = `${month}-01`;
  const lastDay = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
  const to     = `${month}-${String(lastDay).padStart(2,'0')}`;

  const snap = await db.collection('transactions').doc(uid).collection('entries').get();
  const txs  = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  let entradas = 0, saidas = 0;
  for (const tx of txs) {
    if (!tx.dataInicio || tx.dataInicio < from || tx.dataInicio > to) continue;
    if (tx.tipo === 'entrada') entradas += Number(tx.valor) || 0;
    else                       saidas   += Number(tx.valor) || 0;
  }

  const saldo  = entradas - saidas;
  const nomeMes = now.toLocaleString('pt-BR', { month: 'long', timeZone: 'America/Sao_Paulo' });

  return sendMessage(chatId,
    `📊 *Resumo de ${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)}*\n\n` +
    `✅ Entradas: *${formatBRL(entradas)}*\n` +
    `❌ Saídas:   *${formatBRL(saidas)}*\n` +
    `💰 Saldo:    *${formatBRL(saldo)}*`
  );
}

async function handleCartoes(chatId, uid) {
  const snap = await db.collection('cards').doc(uid).collection('list').get();
  const cards = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (cards.length === 0) {
    return sendMessage(chatId, '💳 Nenhum cartão cadastrado.');
  }

  const today = getNowBrasilia().getDate();
  let text = '💳 *Seus cartões:*\n\n';
  for (const c of cards) {
    const diasVenc = ((c.diaVencimento - today + 31) % 31) || 31;
    const urgente  = diasVenc <= 3 ? ' ⚠️' : '';
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
  const hoje = todayStrBrasilia();
  const snap = await db.collection('transactions').doc(uid).collection('entries').get();
  const txs  = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const lancamentos = txs.filter(tx =>
    tx.dataInicio === hoje && tx.frequencia === 'unico'
  ).sort((a, b) => (a.descricao || '').localeCompare(b.descricao || ''));

  const label = hoje.split('-').reverse().join('/');
  let entradas = 0, saidas = 0;
  let text = `📅 *Hoje — ${label}*\n\n`;

  if (lancamentos.length === 0) {
    text += '_Nenhum lançamento registrado hoje._\n\n';
  } else {
    for (const tx of lancamentos) {
      const v    = Number(tx.valor) || 0;
      const sign = tx.tipo === 'entrada' ? '+' : '-';
      const icon = tx.tipo === 'entrada' ? '✅' : '❌';
      text += `${icon} ${tx.descricao || tx.tipo}: *${sign}${formatBRL(v)}*\n`;
      if (tx.tipo === 'entrada') entradas += v; else saidas += v;
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

  const snap = await db.collection('transactions').doc(uid).collection('entries').get();
  const txs  = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  let entradas = 0, saidas = 0;
  const byDay = {};

  for (const tx of txs) {
    if (!tx.dataInicio || tx.dataInicio < fromStr || tx.dataInicio > hoje) continue;
    if (tx.frequencia !== 'unico') continue;
    const v = Number(tx.valor) || 0;
    if (!byDay[tx.dataInicio]) byDay[tx.dataInicio] = { e: 0, s: 0 };
    if (tx.tipo === 'entrada') { entradas += v; byDay[tx.dataInicio].e += v; }
    else                       { saidas   += v; byDay[tx.dataInicio].s += v; }
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

  const snap = await db.collection('transactions').doc(uid).collection('entries').get();
  const txs  = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  let entradas = 0, saidas = 0;
  for (const tx of txs) {
    if (!tx.dataInicio || tx.dataInicio < from || tx.dataInicio > to) continue;
    if (tx.frequencia !== 'unico' && tx.frequencia !== 'parcelado') continue;
    const v = Number(tx.valor) || 0;
    if (tx.tipo === 'entrada') entradas += v; else saidas += v;
  }

  const MESES = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const nomeMes = MESES[month];
  const saldo   = entradas - saidas;

  let text = `📊 *${nomeMes} ${year}*\n\n`;
  text += `✅ Entradas: *${formatBRL(entradas)}*\n`;
  text += `❌ Saídas:   *${formatBRL(saidas)}*\n`;
  text += `💰 Saldo:    *${formatBRL(saldo)}*\n\n`;
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

  const MESES = ['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const nomeMes = MESES[agora.getMonth() + 1];

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
      text += `\`[${bar}] ${pct}%\`  ${formatBRL(s)} de ${formatBRL(budget)}\n\n`;
    } else {
      text += `${icon} *${label}*: ${formatBRL(s)}\n\n`;
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

  const MESES = ['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const LABELS = {
    liberdade: '💎 Liberdade', custos_fixos: '🏠 Custos Fixos', conforto: '🛋 Conforto',
    metas: '🎯 Metas', prazeres: '🎉 Prazeres', conhecimento: '📚 Conhecimento',
  };

  let text = `🎯 *Status das Metas — ${MESES[agora.getMonth()+1]}*\n`;
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

async function handleProjecao(chatId, uid) {
  const agora = getNowBrasilia();
  const hoje  = dateStrFromDate(agora);

  const snap = await db.collection('transactions').doc(uid).collection('entries').get();
  const txs  = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const saldoHoje = calcSaldoSimples(txs, hoje);

  // Saldo mínimo dos próximos 7 dias (para escalar a barra)
  const saldos = [];
  for (let i = 1; i <= 7; i++) {
    const dt  = new Date(agora); dt.setDate(agora.getDate() + i);
    saldos.push({ dt, saldo: calcSaldoSimples(txs, dateStrFromDate(dt)) });
  }
  const minSaldo = Math.min(saldoHoje, ...saldos.map(x => x.saldo));
  const maxSaldo = Math.max(saldoHoje, ...saldos.map(x => x.saldo));
  const escala   = Math.max(maxSaldo - minSaldo, 1);

  let text = `📈 *Projeção — próximos 7 dias*\n\n`;
  text += `💰 Hoje: *${formatBRL(saldoHoje)}*\n\n`;

  const DIAS_PT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  for (const { dt, saldo } of saldos) {
    const ds     = dateStrFromDate(dt);
    const label  = `${DIAS_PT[dt.getDay()]} ${ds.slice(8, 10)}/${ds.slice(5, 7)}`;
    const pos    = saldo - minSaldo;
    const { bar } = barra(pos, escala, 8);
    const icon   = saldo < 0 ? '🔴' : saldo < saldoHoje * 0.5 ? '⚠️' : '✅';
    text += `${icon} ${label} \`[${bar}]\`\n    *${formatBRL(saldo)}*\n`;
  }

  if (minSaldo < 0) {
    text += `\n⚠️ _Saldo negativo previsto no período!_`;
  }

  return sendMessage(chatId, text.trim());
}

async function handleAjuda(chatId) {
  return sendMessage(chatId,
    `🤖 *Matoba Finanças — Comandos disponíveis*\n\n` +

    `*📊 Consultas financeiras*\n` +
    `/saldo — Saldo atual da sua conta\n` +
    `/hoje — Lançamentos registrados hoje\n` +
    `/historico — Últimos 10 lançamentos\n` +
    `/semana — Gráfico de saídas dos últimos 7 dias\n` +
    `/mes — Resumo do mês atual _(ex: /mes 4 para abril)_\n` +
    `/resumo — Entradas, saídas e saldo do mês corrente\n\n` +

    `*🎯 Orçamento e metas*\n` +
    `/categoria — Orçamento por categoria com barras de progresso\n` +
    `/meta — Status de cada meta do Método Sardinha\n\n` +

    `*💳 Cartões*\n` +
    `/cartoes — Seus cartões, vencimentos e limites\n\n` +

    `*📈 Projeção*\n` +
    `/projecao — Saldo projetado nos próximos 7 dias\n\n` +

    `📱 *Para adicionar ou editar lançamentos use o app:*\n` +
    `👉 ${APP_URL}\n\n` +
    `_Para desvincular: Configurações → Bot do Telegram → Desvincular_`
  );
}

// ─── Onboarding — configuração guiada no primeiro contato ────────────────────

const ONBOARDING_STEPS = [
  {
    id:      'cartoes',
    tipos:   ['n1', 'n2', 'n3'],
    question:
      `💳 *Alertas de cartão de crédito*\n\n` +
      `Posso te avisar quando:\n` +
      `• Uma fatura vencer hoje ou em 3 dias\n` +
      `• Uma fatura estiver prestes a fechar (2 dias)\n\n` +
      `Ativar alertas de cartão?`,
  },
  {
    id:      'orcamento',
    tipos:   ['n4', 'n5'],
    question:
      `💰 *Alertas de orçamento*\n\n` +
      `Posso te avisar quando uma categoria do orçamento atingir 80% do limite ou ultrapassá-lo.\n\n` +
      `Ativar alertas de orçamento?`,
  },
  {
    id:      'saldo',
    tipos:   ['n6'],
    question:
      `📉 *Alerta de saldo negativo*\n\n` +
      `Posso te avisar quando a projeção indicar que seu saldo pode ficar negativo nos próximos 7 dias.\n\n` +
      `Ativar esse alerta?`,
  },
  {
    id:      'semanal',
    tipos:   ['n7'],
    question:
      `📊 *Resumo semanal*\n\n` +
      `Toda segunda-feira você receberia um resumo da semana com entradas, saídas e saldo.\n\n` +
      `Ativar resumo semanal?`,
  },
  {
    id:      'diario',
    tipos:   ['n8'],
    question:
      `🌅 *Resumo diário matinal*\n\n` +
      `Todo dia às 7h você receberia uma mensagem com seu saldo atual e os lançamentos previstos para o dia.\n\n` +
      `Ativar resumo diário?`,
  },
];

const SIM_NAO_KB = {
  keyboard:         [[{ text: '✅ Sim' }, { text: '❌ Não' }]],
  resize_keyboard:  true,
  one_time_keyboard: true,
};

function isSimResponse(t) {
  return /^(sim|s|yes|✅ sim|ok|quero|ativo|ativa|claro|pode|bora)$/i.test(t.trim());
}
function isNaoResponse(t) {
  return /^(não|nao|n|no|❌ não|nop|não quero|não preciso|deixa|pula)$/i.test(t.trim());
}

async function sendOnboardingQuestion(chatId, stepIdx) {
  const step  = ONBOARDING_STEPS[stepIdx];
  const total = ONBOARDING_STEPS.length;
  return sendMessage(
    chatId,
    `*Pergunta ${stepIdx + 1} de ${total}*\n\n${step.question}`,
    { reply_markup: SIM_NAO_KB }
  );
}

async function startOnboarding(chatId, uid, email, fromUser) {
  await db.collection('users').doc(uid).set(
    { telegramOnboarding: { active: true, step: 0, tipos: {} } },
    { merge: true }
  );

  await sendMessage(chatId,
    `✅ *Conta vinculada com sucesso!*\n\n` +
    `Olá, *${fromUser?.first_name || 'usuário'}*! 🎉\n` +
    `Sua conta *${email}* está conectada ao Matoba Finanças.\n\n` +
    `Vou te fazer *${ONBOARDING_STEPS.length} perguntas rápidas* para configurar\n` +
    `seus alertas do jeito que você prefere. Responda com *Sim* ou *Não*.\n\n` +
    `_(Tudo pode ser ajustado depois em Configurações → Bot do Telegram no app)_`
  );

  return sendOnboardingQuestion(chatId, 0);
}

async function handleOnboardingStep(chatId, uid, onboarding, text) {
  const stepIdx = onboarding.step || 0;
  const tipos   = { ...(onboarding.tipos || {}) };
  const isPular = /^\/(pular|skip)$/i.test(text.trim());
  const isSim   = isSimResponse(text);
  const isNao   = isNaoResponse(text);

  // Resposta não reconhecida — pede de novo com o teclado
  if (!isSim && !isNao && !isPular) {
    return sendMessage(chatId,
      `Por favor, responda com *Sim* ou *Não* 👇\n\n` +
      `_(Digite /pular para pular esta pergunta)_`,
      { reply_markup: SIM_NAO_KB }
    );
  }

  // Registra resposta para todos os tipos do passo atual
  const step  = ONBOARDING_STEPS[stepIdx];
  const valor = isPular ? true : isSim; // /pular ativa por padrão
  for (const t of step.tipos) tipos[t] = valor;

  const nextStep = stepIdx + 1;

  // Onboarding concluído
  if (nextStep >= ONBOARDING_STEPS.length) {
    await db.collection('users').doc(uid).update({
      telegramOnboarding: admin.firestore.FieldValue.delete(),
    });
    await db.collection('config').doc(uid).set(
      { notificacoes: { telegramEnabled: true, tipos } },
      { merge: true }
    );

    const ativos = Object.values(tipos).filter(v => v === true).length;
    const total  = Object.keys(tipos).length;

    return sendMessage(chatId,
      `🎉 *Tudo configurado!*\n\n` +
      `${ativos} de ${total} tipos de alerta ativados.\n\n` +
      `Agora você pode usar todos os comandos. Digite /ajuda para ver tudo disponível.\n\n` +
      `Para ajustar as notificações: *Configurações → Bot do Telegram* no app.`,
      { reply_markup: { remove_keyboard: true } }
    );
  }

  // Avança para o próximo passo
  await db.collection('users').doc(uid).set(
    { telegramOnboarding: { active: true, step: nextStep, tipos } },
    { merge: true }
  );

  return sendOnboardingQuestion(chatId, nextStep);
}

// ─── Processamento do update Telegram ────────────────────────────────────────
async function processUpdate(update) {
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
  const cmd  = rawCmd.toLowerCase().replace(/@\w+$/, ''); // remove @BotName
  const args = argParts.join(' ');

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

  // Se usuário tem onboarding ativo, intercepta TODAS as mensagens
  {
    const userData   = usersSnap.docs[0].data();
    const onboarding = userData.telegramOnboarding;
    if (onboarding?.active) {
      return handleOnboardingStep(chatId, uid, onboarding, text);
    }
  }

  // Comandos que tentam adicionar/editar → redireciona para o app
  const CMDS_BLOQUEADOS = ['/adicionar','/add','/novo','/new','/editar','/edit','/excluir','/deletar','/delete','/remover','/remove'];
  if (CMDS_BLOQUEADOS.includes(cmd)) {
    return msgSomenteApp(chatId);
  }

  switch (cmd) {
    case '/saldo':     return handleSaldo(chatId, uid);
    case '/hoje':      return handleHoje(chatId, uid);
    case '/historico': return handleHistorico(chatId, uid);
    case '/semana':    return handleSemana(chatId, uid);
    case '/mes':       return handleMes(chatId, uid, args);
    case '/resumo':    return handleResumo(chatId, uid);
    case '/categoria': return handleCategoria(chatId, uid);
    case '/meta':      return handleMeta(chatId, uid);
    case '/cartoes':   return handleCartoes(chatId, uid);
    case '/projecao':  return handleProjecao(chatId, uid);
    case '/ajuda':
    case '/help':      return handleAjuda(chatId);
    default:
      return sendMessage(chatId,
        `Comando não reconhecido. Use /ajuda para ver todos os comandos disponíveis.`
      );
  }
}

// ─── EXPORT 1: Webhook HTTPS ──────────────────────────────────────────────────
// invoker: 'public' — permite chamadas não autenticadas (necessário para o Telegram)
exports.telegramWebhook = onRequest(
  { region: REGION, timeoutSeconds: 30, invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') { res.sendStatus(405); return; }
    try {
      await processUpdate(req.body);
    } catch (err) {
      logger.error('[TG webhook]', err);
    }
    res.sendStatus(200); // Telegram espera 200 sempre
  }
);

// ─── EXPORT 2: Notificações diárias às 07:00 Brasília (10:00 UTC) ─────────────
exports.dailyNotifications = onSchedule(
  { schedule: '0 10 * * *', timeZone: 'UTC', region: REGION },
  async () => {
    logger.info('[NOTIF] Iniciando verificações diárias...');

    // Busca todos os usuários com Telegram vinculado
    const usersSnap = await db.collection('users')
      .where('telegramChatId', '!=', null)
      .get();

    if (usersSnap.empty) {
      logger.info('[NOTIF] Nenhum usuário com Telegram vinculado.');
      return;
    }

    for (const userDoc of usersSnap.docs) {
      const uid      = userDoc.id;
      const chatId   = userDoc.data().telegramChatId;
      if (!chatId) continue;

      try {
        // Lê configurações do usuário
        const configDoc = await db.collection('config').doc(uid).get();
        const config    = configDoc.exists ? configDoc.data() : {};
        const prefs     = config.notificacoes || {};

        // Verifica se notificações estão habilitadas para Telegram
        if (!prefs.telegramEnabled) continue;

        // Lê cartões
        const cardsSnap = await db.collection('cards').doc(uid).collection('list').get();
        const cards     = cardsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Lê transações
        const txSnap     = await db.collection('transactions').doc(uid).collection('entries').get();
        const transactions = txSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Verifica alertas
        const msgs = checkNotifications(cards, transactions, config, prefs);

        // Envia mensagens
        for (const msg of msgs) {
          await sendMessage(chatId, msg);
          // Pausa pequena para não estourar rate limit do Telegram
          await new Promise(r => setTimeout(r, 100));
        }

        if (msgs.length > 0) {
          logger.info(`[NOTIF] uid=${uid}: ${msgs.length} alerta(s) enviado(s)`);
        }
      } catch (err) {
        logger.error(`[NOTIF] Erro ao processar uid=${uid}:`, err);
      }
    }

    logger.info('[NOTIF] Concluído.');
  }
);

// ─── EXPORT 3: Status e configuração do webhook ───────────────────────────────
// GET  → retorna informações atuais do webhook registrado no Telegram
// POST → registra a URL passada no body { url: "https://..." }
// Lista de comandos exibidos no menu do BotFather
const BOT_COMMANDS = [
  { command: 'saldo',     description: 'Saldo atual da conta' },
  { command: 'hoje',      description: 'Lancamentos registrados hoje' },
  { command: 'historico', description: 'Ultimos 10 lancamentos' },
  { command: 'semana',    description: 'Grafico de saidas dos ultimos 7 dias' },
  { command: 'mes',       description: 'Resumo do mes (ex: /mes 4 para abril)' },
  { command: 'resumo',    description: 'Entradas, saidas e saldo do mes corrente' },
  { command: 'categoria', description: 'Orcamento por categoria com barras de progresso' },
  { command: 'meta',      description: 'Status das metas do Metodo Sardinha' },
  { command: 'cartoes',   description: 'Cartoes cadastrados e vencimentos' },
  { command: 'projecao',  description: 'Saldo projetado para os proximos 7 dias' },
  { command: 'ajuda',     description: 'Lista completa de comandos' },
];

exports.setTelegramWebhook = onRequest(
  { region: REGION },
  async (req, res) => {
    if (req.method === 'POST' && req.body?.url) {
      const webhookResult = await tgFetch('setWebhook', {
        url:             req.body.url,
        allowed_updates: ['message'],
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
