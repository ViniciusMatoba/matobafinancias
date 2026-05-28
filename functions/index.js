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

  return sendMessage(chatId,
    `✅ *Conta vinculada com sucesso!*\n\n` +
    `Olá, *${fromUser?.first_name || 'usuário'}*! 🎉\n` +
    `Sua conta *${email}* está conectada ao Matoba Finanças.\n\n` +
    `Use /ajuda para ver os comandos disponíveis.`
  );
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

async function handleAdicionar(chatId, uid, args) {
  // /adicionar 150,00 Almoço restaurante
  const parts = args.trim().split(/\s+/);
  if (parts.length < 2) {
    return sendMessage(chatId,
      '❌ Formato: `/adicionar <valor> <descrição>`\n' +
      'Exemplo: `/adicionar 150 Almoço`'
    );
  }

  const valorStr  = parts[0].replace(',', '.');
  const valor     = parseFloat(valorStr);
  if (!valor || isNaN(valor)) {
    return sendMessage(chatId, '❌ Valor inválido. Exemplo: `/adicionar 150,00 Almoço`');
  }

  const descricao = parts.slice(1).join(' ');
  const today     = todayStrBrasilia();

  await db.collection('transactions').doc(uid).collection('entries').add({
    tipo:       'saida',
    descricao,
    valor,
    dataInicio: today,
    frequencia: 'unico',
    categoria:  null,
    criadoVia:  'telegram',
    criadoEm:   admin.firestore.FieldValue.serverTimestamp(),
  });

  return sendMessage(chatId,
    `✅ *Lançamento adicionado!*\n` +
    `• Descrição: ${descricao}\n` +
    `• Valor: ${formatBRL(valor)}\n` +
    `• Data: ${today.split('-').reverse().join('/')}`
  );
}

async function handleAjuda(chatId) {
  return sendMessage(chatId,
    `🤖 *Matoba Finanças — Comandos*\n\n` +
    `/saldo — Saldo atual\n` +
    `/resumo — Resumo do mês corrente\n` +
    `/cartoes — Seus cartões e vencimentos\n` +
    `/adicionar <valor> <desc> — Registra uma saída\n` +
    `  Ex: /adicionar 35,50 Lanche\n\n` +
    `/ajuda — Esta mensagem\n\n` +
    `_Para desvincular sua conta, acesse Configurações no aplicativo._`
  );
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
      '2. Vá em *Configurações → Notificações → Telegram*\n' +
      '3. Gere um código e envie `/vincular CÓDIGO` aqui'
    );
  }

  switch (cmd) {
    case '/saldo':      return handleSaldo(chatId, uid);
    case '/resumo':     return handleResumo(chatId, uid);
    case '/cartoes':    return handleCartoes(chatId, uid);
    case '/adicionar':  return handleAdicionar(chatId, uid, args);
    case '/ajuda':
    case '/help':       return handleAjuda(chatId);
    default:
      return sendMessage(chatId,
        `Comando não reconhecido. Use /ajuda para ver os comandos disponíveis.`
      );
  }
}

// ─── EXPORT 1: Webhook HTTPS ──────────────────────────────────────────────────
exports.telegramWebhook = onRequest(
  { region: REGION, timeoutSeconds: 30 },
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
exports.setTelegramWebhook = onRequest(
  { region: REGION },
  async (req, res) => {
    if (req.method === 'POST' && req.body?.url) {
      const result = await tgFetch('setWebhook', {
        url:             req.body.url,
        allowed_updates: ['message'],
      });
      res.json({ registered: req.body.url, result });
    } else {
      // GET: retorna status atual
      const info = await tgFetch('getWebhookInfo', {});
      res.json(info);
    }
  }
);
