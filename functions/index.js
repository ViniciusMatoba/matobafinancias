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

const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https');
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

// Meses em português (índice 1–12 = Janeiro–Dezembro)
const MESES_LONGO  = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MESES_CURTO  = ['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

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
  return admin.messaging().send({
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

/**
 * Avança `cur` em 1 mês, travando o dia no último dia do mês destino.
 * Corrige o overflow do JavaScript (ex: 31 jan + 1 mês → 28/29 fev, não 3 mar).
 * @deprecated Prefira addOneMonthClampedTo(cur, origDay) para preservar o dia original.
 */
function addOneMonthClamped(cur) {
  const day = cur.getDate();
  cur.setDate(1);
  cur.setMonth(cur.getMonth() + 1);
  const lastDay = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
  cur.setDate(Math.min(day, lastDay));
}

/**
 * Avança `cur` em 1 mês usando `origDay` como dia-alvo, fazendo clamp ao último
 * dia do mês destino. Resolve o drift acumulado: Jan 31 → Fev 28 → Mar 31 (correto).
 */
function addOneMonthClampedTo(cur, origDay) {
  cur.setDate(1);
  cur.setMonth(cur.getMonth() + 1);
  const lastDay = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
  cur.setDate(Math.min(origDay, lastDay));
}

function formatBRL(n) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0);
}

function parseBRL(val) {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  return parseFloat(String(val).replace(/\./g, '').replace(',', '.')) || 0;
}

// Barra de progresso ASCII — ex: [████████░░] 82%
function barra(valor, maximo, largura = 10) {
  const pct  = maximo > 0 ? valor / maximo : 0;
  const fill = Math.round(Math.min(pct, 1) * largura);
  const bar  = '█'.repeat(fill) + '░'.repeat(Math.max(0, largura - fill));
  return { bar, pct: maximo > 0 ? Math.round(pct * 100) : 0 };
}

const APP_URL = 'https://viniciusmatoba.github.io/matobafinancias/';

// ─── Ciclo de cartão (espelha getProximoVencimento do frontend) ──────────────
function getProximoVencimentoBot(card, today) {
  const [y, m, d] = today.split('-').map(Number);
  const diaFech = card.diaFechamento || card.diaVencimento;
  const diaVenc = card.diaVencimento;
  let mes = m, ano = y;
  if (d > diaFech) { mes += 1; if (mes > 12) { mes = 1; ano += 1; } }
  if (diaVenc < diaFech) { mes += 1; if (mes > 12) { mes = 1; ano += 1; } }
  const lastDay = new Date(ano, mes, 0).getDate();
  const dia = Math.min(diaVenc, lastDay);
  return `${ano}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
}

/**
 * Calcula faturaAtual e comprometidoFuturo de um cartão.
 * Espelha calcFaturaCard do frontend, incluindo projeção de parcelas virtuais.
 */
function calcFaturaCardBot(card, transactions, today) {
  const proximoVenc = getProximoVencimentoBot(card, today);
  const [pvy, pvm, pvd] = proximoVenc.split('-').map(Number);
  const pm = pvm === 1 ? 12 : pvm - 1;
  const py = pvm === 1 ? pvy - 1 : pvy;
  const plast = new Date(py, pm, 0).getDate();
  const prevVencStr = `${py}-${String(pm).padStart(2,'0')}-${String(Math.min(pvd, plast)).padStart(2,'0')}`;

  const cardTxs = transactions.filter(
    t => t.tipo === 'cartao' && t.cartaoId === card.id && !t.conferido
  );

  const realInWindow = cardTxs.filter(
    t => t.dataInicio > prevVencStr && t.dataInicio <= proximoVenc
  );

  let faturaAtual = 0;
  if (realInWindow.length > 0) {
    realInWindow.forEach(tx => { faturaAtual += Number(tx.valor) || 0; });
  } else {
    // Sem lançamento real: projeta parcelas de transações passadas
    const occs = expandRange(
      cardTxs.filter(t => t.dataInicio <= prevVencStr),
      prevVencStr, proximoVenc
    ).filter(o => o.date > prevVencStr && o.date <= proximoVenc);
    occs.forEach(o => { faturaAtual += o.valor; });
  }

  let comprometidoFuturo = 0;
  cardTxs.filter(t => t.dataInicio > proximoVenc).forEach(tx => {
    comprometidoFuturo += Number(tx.valor) || 0;
  });
  cardTxs.forEach(tx => {
    if (!tx.itens?.length) return;
    tx.itens.forEach(item => {
      if (!item.isParcelado) return;
      const remaining = (item.totalParcelas || 1) - (item.parcelaAtual || 1);
      if (remaining <= 0) return;
      comprometidoFuturo += remaining * (Number(item.valor) || 0);
    });
  });
  if (realInWindow.length === 0) {
    comprometidoFuturo = Math.max(0, comprometidoFuturo - faturaAtual);
  }

  const limite = card.limite || 0;
  const limiteDisponivel = Math.max(0, limite - faturaAtual - comprometidoFuturo);
  return { faturaAtual, comprometidoFuturo, limiteDisponivel, proximoVenc, prevVenc: prevVencStr };
}

// ─── Expansão de transações em um intervalo [from, to] ───────────────────────
// Espelha o expandOccurrences do frontend para consistência nos cálculos.
// Retorna array de { date, valor, tipo }
const TYPE_SIGN = { entrada: +1, saida: -1, diario: -1, cartao: -1, investimento: -1 };

/**
 * Expande transações no intervalo [from, to].
 * @param {boolean} historical — quando true, inclui ocorrências passadas de tipo='diario'
 *   (estimativas diárias). Quando false (padrão), omite-as, espelhando o comportamento
 *   do frontend: gastos diários são provisões, não saídas reais confirmadas.
 */
function expandRange(transactions, from, to, { historical = false } = {}) {
  const today = todayStrBrasilia();
  const occs = [];
  for (const tx of transactions) {
    if (!tx.dataInicio || tx.dataInicio > to) continue;
    const v       = Number(tx.valor) || 0;
    if (!v) continue;
    const excl    = Array.isArray(tx.exclusoes) ? tx.exclusoes : [];
    // Espelha a regra do frontend: ocorrências passadas de tipo 'diario' só entram
    // em modo histórico — no cálculo de saldo normal são ignoradas.
    const push    = (ds) => {
      if (excl.includes(ds)) return;
      if (!historical && tx.tipo === 'diario' && ds < today) return;
      occs.push({ date: ds, valor: v, tipo: tx.tipo, tx });
    };

    if (tx.frequencia === 'unico') {
      if (tx.dataInicio >= from && tx.dataInicio <= to) push(tx.dataInicio);

      // Projeção de faturas futuras de itens de cartão (cartão de crédito)
      if (tx.tipo === 'cartao' && Array.isArray(tx.itens) && tx.itens.length > 0) {
        const parcelados = tx.itens.filter(i => i.isParcelado && (i.totalParcelas || 1) > (i.parcelaAtual || 1));
        if (parcelados.length > 0) {
          let maxMeses = 0;
          parcelados.forEach(i => {
            const remaining = (i.totalParcelas || 1) - (i.parcelaAtual || 1);
            if (remaining > maxMeses) maxMeses = remaining;
          });

          for (let m = 1; m <= maxMeses; m++) {
            const pd = new Date(tx.dataInicio + 'T00:00:00');
            for (let j = 0; j < m; j++) addOneMonthClamped(pd);
            const futureDate = dateStrFromDate(pd);

            if (futureDate > to) continue;
            if (excl.includes(futureDate)) continue;

            const futureItens = parcelados
              .filter(i => (i.parcelaAtual || 1) + m <= i.totalParcelas)
              .map(i => ({ ...i, parcelaAtual: (i.parcelaAtual || 1) + m }));

            if (futureItens.length > 0 && futureDate >= from) {
              const futureValor = futureItens.reduce((s, i) => s + (Number(i.valor) || 0), 0);
              const virtualTx = {
                ...tx,
                id: `${tx.id}-proj-${m}`,
                valor: futureValor,
                descricao: `${tx.descricao || 'Fatura'} (Parcelas restantes)`,
                itens: futureItens,
                conferido: false,
              };
              occs.push({ date: futureDate, valor: futureValor, tipo: tx.tipo, tx: virtualTx });
            }
          }
        }
      }

    } else if (tx.frequencia === 'parcelado') {
      const total = tx.totalParcelas || 1;
      const start = tx.parcelaAtual  || 1;
      for (let i = 0; i < total - start + 1; i++) {
        const pd = new Date(tx.dataInicio + 'T00:00:00');
        for (let j = 0; j < i; j++) addOneMonthClamped(pd);
        const ds = dateStrFromDate(pd);
        if (ds > to) break;
        if (ds >= from && (!tx.dataFim || ds <= tx.dataFim)) push(ds);
      }

    } else if (tx.frequencia === 'mensal') {
      const end     = tx.dataFim && tx.dataFim < to ? tx.dataFim : to;
      const origDay = new Date(tx.dataInicio + 'T00:00:00').getDate();
      let cur = new Date(tx.dataInicio + 'T00:00:00');
      while (dateStrFromDate(cur) <= end) {
        const ds = dateStrFromDate(cur);
        if (ds >= from) push(ds);
        addOneMonthClampedTo(cur, origDay); // preserva dia original (ex.: 31 → Mar 31)
      }

    } else if (tx.frequencia === 'semanal') {
      const end = tx.dataFim && tx.dataFim < to ? tx.dataFim : to;
      let cur = new Date(tx.dataInicio + 'T00:00:00');
      while (dateStrFromDate(cur) <= end) {
        const ds = dateStrFromDate(cur);
        if (ds >= from) push(ds);
        cur.setDate(cur.getDate() + 7);
      }

    } else if (tx.frequencia === 'diario') {
      // valor já é por dia (mensal / 30); gera uma ocorrência por dia
      const startStr = tx.dataInicio > from ? tx.dataInicio : from;
      const endStr   = tx.dataFim && tx.dataFim < to ? tx.dataFim : to;
      let cur = new Date(startStr + 'T00:00:00');
      const endDt = new Date(endStr + 'T00:00:00');
      while (cur <= endDt) {
        push(dateStrFromDate(cur));
        cur.setDate(cur.getDate() + 1);
      }
    }
  }
  return occs;
}

// ─── Cálculo de saldo acumulado até upTo ──────────────────────────────────────
// walletInitials: soma dos saldoInicial de todas as carteiras do usuário
function calcSaldoSimples(transactions, upTo, walletInitials = 0) {
  const FAR_PAST = '2020-01-01';
  const occs = expandRange(transactions, FAR_PAST, upTo);
  const txSaldo = occs.reduce((acc, o) => {
    const sign = TYPE_SIGN[o.tipo] ?? -1;
    return acc + sign * o.valor;
  }, 0);
  return txSaldo + walletInitials;
}

// ─── Gasto por categoria no mês corrente ─────────────────────────────────────
const CATEGORY_ORDER = ['liberdade','custos_fixos','conforto','metas','prazeres','conhecimento'];

/**
 * Retorna o Set de cartaoIds que têm pelo menos uma fatura REAL (não projeção virtual)
 * no intervalo [from, to]. Usado para descartar projeções virtuais de meses anteriores
 * quando já existe lançamento real do mesmo cartão no período — evita dupla contagem.
 */
function cartaoComFaturaRealNoMes(transactions, from, to) {
  return new Set(
    transactions
      .filter(t => t.tipo === 'cartao' && t.dataInicio >= from && t.dataInicio <= to)
      .map(t => t.cartaoId)
  );
}

function computeSpentByCategory(transactions, currentMonth) {
  const totals = Object.fromEntries(CATEGORY_ORDER.map(id => [id, 0]));
  const [year, mon] = currentMonth.split('-').map(Number);
  const from = `${currentMonth}-01`;
  const to   = `${currentMonth}-${String(new Date(year, mon, 0).getDate()).padStart(2,'0')}`;

  // Cartões com fatura real no mês — projeções virtuais desses cartões são ignoradas
  const comFaturaReal = cartaoComFaturaRealNoMes(transactions, from, to);

  // Sem historical: comportamento igual ao BudgetSummaryCard do app — diário passado ignorado
  const occs = expandRange(transactions, from, to);

  for (const o of occs) {
    const tx = o.tx;
    if (!tx || tx.tipo === 'entrada') continue;

    // ── Cartão com itens ────────────────────────────────────────────────────
    if (tx.tipo === 'cartao' && tx.itens?.length > 0) {
      // Projeção virtual (id = "txId-proj-N") de cartão que já tem fatura real: ignora
      if (tx.id?.includes('-proj-') && comFaturaReal.has(tx.cartaoId)) continue;

      for (const item of tx.itens) {
        const cat = item.categoria;
        if (!cat || !(cat in totals)) continue;
        const valor = Number(item.valor) || 0;

        if (item.isParcelado) {
          totals[cat] += valor;
        } else {
          // Itens avulsos não parcelados contam apenas no mês da compra (dataCompra)
          if (item.dataCompra?.startsWith(currentMonth)) {
            totals[cat] += valor;
          }
        }
      }
      continue;
    }

    // ── Demais tipos (saida, diario, investimento) ─────────────────────────
    const cat = tx.categoria || (tx.tipo === 'investimento' ? 'liberdade' : null);
    if (!cat || !(cat in totals)) continue;
    totals[cat] += o.valor;
  }
  return totals;
}

// Retorna as duas maiores subcategorias (descrições) de gastos no mês para uma categoria
function getTopExpensesForCategory(transactions, category, currentMonth) {
  const [year, mon] = currentMonth.split('-').map(Number);
  const from = `${currentMonth}-01`;
  const to   = `${currentMonth}-${String(new Date(year, mon, 0).getDate()).padStart(2,'0')}`;

  // Mesma regra: projeções virtuais de cartões com fatura real são ignoradas
  const comFaturaReal = cartaoComFaturaRealNoMes(transactions, from, to);

  const occs = expandRange(transactions, from, to);

  const groups = {};
  for (const o of occs) {
    const tx = o.tx;
    if (!tx || tx.tipo === 'entrada') continue;

    // Tratamento para cartão com itens
    if (tx.tipo === 'cartao' && tx.itens?.length > 0) {
      if (tx.id?.includes('-proj-') && comFaturaReal.has(tx.cartaoId)) continue;

      for (const item of tx.itens) {
        if (item.categoria === category) {
          const valor = Number(item.valor) || 0;
          if (item.isParcelado || item.dataCompra?.startsWith(currentMonth)) {
            const desc = item.descricao?.trim() || tx.descricao?.trim() || 'Despesa Cartão';
            groups[desc] = (groups[desc] || 0) + valor;
          }
        }
      }
      continue;
    }

    // Tratamento para demais lançamentos
    const cat = tx.categoria || (tx.tipo === 'investimento' ? 'liberdade' : null);
    if (cat === category) {
      const desc = tx.descricao?.trim() || tx.tipo;
      groups[desc] = (groups[desc] || 0) + o.valor;
    }
  }

  // Ordena por valor decrescente e pega os 2 principais
  const sorted = Object.entries(groups)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);

  if (sorted.length === 0) return '';
  return sorted.map(([desc, val]) => `${desc}: ${formatBRL(val)}`).join(', ');
}

// ─── Verificações de notificação (N1-N17) ───────────────────────────────────
function checkNotifications(cards, transactions, config, prefs, goals = [], walletInitials = 0) {
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

  // N2 — Fatura vence em X dias (suporta múltiplos prazos configurados)
  if (tipos.n2 !== false) {
    const raw = prefs.diasAntecedenciaVencimento;
    const diasArr = Array.isArray(raw) ? raw : [raw || 3];
    for (const diasAviso of diasArr) {
      const dX = new Date(hoje); dX.setDate(dX.getDate() + diasAviso);
      for (const card of cards) {
        if (card.diaVencimento === dX.getDate()) {
          msgs.push(`📅 *Fatura em ${diasAviso} dia${diasAviso > 1 ? 's' : ''}*\n${card.nome} vence no dia *${card.diaVencimento}*.`);
        }
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
          const top = getTopExpensesForCategory(transactions, catId, currentMonth);
          const topStr = top ? `\nPrincipais gastos: _${top}_.` : '';
          msgs.push(`🚨 *${LABELS[catId]} estourou!*\nGasto ${formatBRL(s)} de ${formatBRL(budget)} — excedeu em *${formatBRL(s - budget)}*.${topStr}`);
        } else if (tipos.n4 !== false && pct >= 80 && pct <= 100) {
          const top = getTopExpensesForCategory(transactions, catId, currentMonth);
          const topStr = top ? `\nPrincipais gastos: _${top}_.` : '';
          msgs.push(`⚠️ *${LABELS[catId]} em ${Math.round(pct)}%*\n${formatBRL(s)} de ${formatBRL(budget)} utilizados este mês.${topStr}`);
        }
      }
    }
  }

  // N6 — Saldo negativo projetado em 7 dias
  // Usa calcSaldoSimples até in7: inclui entradas, todas as frequências e projeções virtuais
  if (tipos.n6 !== false) {
    const saldoAtual = calcSaldoSimples(transactions, todayStr, walletInitials);
    const d7 = new Date(hoje); d7.setDate(d7.getDate() + 7);
    const in7 = dateStrFromDate(d7);
    const saldoProjetado = calcSaldoSimples(transactions, in7, walletInitials);
    if (saldoProjetado < 0) {
      msgs.push(`📉 *Alerta: saldo pode ficar negativo!*\nSaldo atual ${formatBRL(saldoAtual)} · Projeção *${formatBRL(saldoProjetado)}* em 7 dias.`);
    }
  }

  // N7 — Resumo semanal (suporta múltiplos dias configurados)
  const rawDiaSem = prefs.diaSemanaResumo;
  const diasSemArr = Array.isArray(rawDiaSem) ? rawDiaSem : [rawDiaSem ?? 1];
  if (tipos.n7 !== false && diasSemArr.includes(weekday)) {
    const d7ago = new Date(hoje); d7ago.setDate(d7ago.getDate() - 7);
    const fromStr = dateStrFromDate(d7ago);
    let entradas = 0, saidas = 0;

    for (const tx of transactions) {
      if (!tx.dataInicio || tx.dataInicio > todayStr) continue;
      const v    = Number(tx.valor) || 0;
      if (!v) continue;
      const isEnt = tx.tipo === 'entrada';

      if (tx.frequencia === 'unico' || tx.frequencia === 'parcelado') {
        if (tx.dataInicio >= fromStr) {
          if (isEnt) entradas += v; else saidas += v;
        }
      } else if (tx.frequencia === 'mensal') {
        // Expande ocorrências mensais dentro da janela (preservando dia original)
        const origDay7 = new Date(tx.dataInicio + 'T00:00:00').getDate();
        let cur = new Date(tx.dataInicio + 'T00:00:00');
        const endDate = tx.dataFim && tx.dataFim < todayStr ? tx.dataFim : todayStr;
        while (dateStrFromDate(cur) <= endDate) {
          const ds = dateStrFromDate(cur);
          if (ds >= fromStr) {
            if (isEnt) entradas += v; else saidas += v;
          }
          addOneMonthClampedTo(cur, origDay7);
        }
      } else if (tx.frequencia === 'semanal') {
        let cur = new Date(tx.dataInicio + 'T00:00:00');
        const endDate = tx.dataFim && tx.dataFim < todayStr ? tx.dataFim : todayStr;
        while (dateStrFromDate(cur) <= endDate) {
          const ds = dateStrFromDate(cur);
          if (ds >= fromStr) {
            if (isEnt) entradas += v; else saidas += v;
          }
          cur.setDate(cur.getDate() + 7);
        }
      } else if (tx.frequencia === 'diario') {
        // Valor já é diário; soma os dias da janela que o tx cobre
        const inicio = tx.dataInicio > fromStr ? tx.dataInicio : fromStr;
        const fim    = tx.dataFim && tx.dataFim < todayStr ? tx.dataFim : todayStr;
        if (inicio <= fim) {
          const dias = Math.round((new Date(fim) - new Date(inicio)) / 86400000) + 1;
          if (isEnt) entradas += v * dias; else saidas += v * dias;
        }
      }
    }

    msgs.push(`📊 *Resumo semanal*\n✅ Entradas: ${formatBRL(entradas)}\n❌ Saídas: ${formatBRL(saidas)}\n💰 Saldo da semana: *${formatBRL(entradas - saidas)}*`);
  }

  // N8 — Resumo diário matinal (dias configuráveis: todos / uteis / fds)
  if (tipos.n8 !== false) {
    const diasDiario = prefs.diasResumoDiario || 'todos';
    const enviarN8 =
      diasDiario === 'todos' ||
      (diasDiario === 'uteis' && weekday >= 1 && weekday <= 5) ||
      (diasDiario === 'fds'   && (weekday === 0 || weekday === 6));

    if (enviarN8) {
    const saldoAtual = calcSaldoSimples(transactions, todayStr, walletInitials);
    // Expande TODAS as ocorrências de hoje (unico, recorrentes, parcelados, diario)
    const occsHoje   = expandRange(transactions, todayStr, todayStr);

    const [, , dd] = todayStr.split('-');
    const nomeMesHoje = hoje.toLocaleString('pt-BR', { month: 'long', timeZone: 'America/Sao_Paulo' });
    let msg = `🌅 *Bom dia! Resumo de ${dd} de ${nomeMesHoje}*\n\n`;
    msg += `💰 Saldo atual: *${formatBRL(saldoAtual)}*\n\n`;

    if (occsHoje.length > 0) {
      let entH = 0, saiH = 0;
      msg += `📋 *Lançamentos de hoje:*\n`;
      for (const o of occsHoje) {
        const v    = o.valor;
        const icon = o.tipo === 'entrada' ? '✅' : '❌';
        const sign = o.tipo === 'entrada' ? '+' : '-';
        const desc = o.tx?.descricao || o.tipo;
        // Indica se é recorrente ou parcelado
        const freqTag = o.tx?.frequencia === 'mensal' ? ' 🔄' :
                        o.tx?.frequencia === 'semanal' ? ' 🔄' :
                        o.tx?.frequencia === 'parcelado' ? ` (${o.tx.parcelaAtual}/${o.tx.totalParcelas}x)` :
                        o.tx?.tipo === 'diario' ? ' (diário)' : '';
        msg += `${icon} ${desc}${freqTag}: *${sign}${formatBRL(v)}*\n`;
        if (o.tipo === 'entrada') entH += v; else saiH += v;
      }
      if (occsHoje.length > 1) msg += `_Saldo do dia: ${formatBRL(entH - saiH)}_\n\n`;
      else msg += '\n';
    } else {
      msg += `_Nenhum lançamento para hoje._\n\n`;
    }

    // Inclui faturas só se N1 estiver explicitamente desativado
    // (N1 é ativo por padrão quando tipos.n1 !== false, então só omite quando === false)
    if (tipos.n1 === false) {
      const fatHoje = cards.filter(c => c.diaVencimento === day);
      if (fatHoje.length > 0) {
        msg += `💳 *Fatura vencendo hoje:*\n`;
        for (const c of fatHoje) msg += `• ${c.nome}\n`;
        msg += '\n';
      }
    }

    msg += `_Bom dia e boas finanças! 🚀_`;
    msgs.push(msg.trim());
    } // fim if (enviarN8)
  }

  // N9 — Limite Geral de Gastos Mensais
  if (tipos.n9 !== false) {
    const rendaMensal = config?.rendaMensal || 0;
    if (rendaMensal > 0) {
      const fromStr = `${currentMonth}-01`;
      const [y9, m9] = currentMonth.split('-').map(Number);
      const lastDay9 = new Date(y9, m9, 0).getDate();
      const toStr = `${currentMonth}-${String(lastDay9).padStart(2, '0')}`;

      // Despesas não-cartão via expandRange (sem risco de dupla contagem)
      const nonCardOccs = expandRange(
        transactions.filter(t => t.tipo !== 'cartao'), fromStr, toStr
      );
      let totalGasto = nonCardOccs
        .filter(o => o.tipo !== 'entrada')
        .reduce((sum, o) => sum + o.valor, 0);

      // Cartão: usa calcFaturaCardBot para não dupla-contar parcelas virtuais de meses anteriores
      // (expandRange geraria tanto a fatura real do mês quanto as parcelas virtuais do mês passado)
      for (const card of cards) {
        const { faturaAtual } = calcFaturaCardBot(card, transactions, todayStr);
        totalGasto += faturaAtual;
      }

      const pct = (totalGasto / rendaMensal) * 100;
      if (pct > 100) {
        msgs.push(`🚨 *Limite Geral Ultrapassado!*\nSeus gastos totais atingiram ${formatBRL(totalGasto)} de ${formatBRL(rendaMensal)} (excedeu o orçamento geral em *${formatBRL(totalGasto - rendaMensal)}*).`);
      } else if (pct >= 80) {
        msgs.push(`⚠️ *Limite Geral em ${Math.round(pct)}%*\nVocê já utilizou ${formatBRL(totalGasto)} de ${formatBRL(rendaMensal)} do seu orçamento geral deste mês.`);
      }
    }
  }

  // N10 — Alerta de Contas Fixas/Lançamentos Recorrentes Pendentes
  if (tipos.n10 !== false) {
    const d2 = new Date(hoje); d2.setDate(d2.getDate() + 2);
    const in2Str = dateStrFromDate(d2);
    
    for (const tx of transactions) {
      if (tx.tipo === 'entrada' || tx.tipo === 'cartao') continue;
      const v = Number(tx.valor) || 0;
      if (!v || !tx.dataInicio) continue;

      if (tx.frequencia === 'mensal') {
        const txDay = parseInt(tx.dataInicio.split('-')[2], 10);
        if (d2.getDate() === txDay && in2Str >= tx.dataInicio && (!tx.dataFim || in2Str <= tx.dataFim)) {
          const jaPago = Array.isArray(tx.conferidos) && tx.conferidos.includes(in2Str);
          if (!jaPago) {
            msgs.push(`⏰ *Conta fixa vence em 2 dias!*\n${tx.descricao || tx.tipo} — valor de *${formatBRL(v)}* está previsto para ${d2.getDate()}/${String(d2.getMonth()+1).padStart(2,'0')}.`);
          }
        }
      } else if (tx.frequencia === 'semanal') {
        let cur = new Date(tx.dataInicio + 'T00:00:00');
        const endLimit = tx.dataFim ? tx.dataFim : in2Str;
        let achouOcorrencia = false;
        while (dateStrFromDate(cur) <= in2Str) {
          const ds = dateStrFromDate(cur);
          if (ds === in2Str && ds <= endLimit) {
            achouOcorrencia = true;
            break;
          }
          cur.setDate(cur.getDate() + 7);
        }
        if (achouOcorrencia) {
          const jaPago = Array.isArray(tx.conferidos) && tx.conferidos.includes(in2Str);
          if (!jaPago) {
            msgs.push(`⏰ *Conta semanal vence em 2 dias!*\n${tx.descricao || tx.tipo} — valor de *${formatBRL(v)}* está previsto para ${d2.getDate()}/${String(d2.getMonth()+1).padStart(2,'0')}.`);
          }
        }
      }
    }
  }

  // N11 — Limite de Cartão Comprometido
  if (tipos.n11 !== false) {
    for (const card of cards) {
      if (!card.limite || card.limite <= 0) continue;

      const { faturaAtual, comprometidoFuturo } = calcFaturaCardBot(card, transactions, todayStr);
      const totalComprometido = faturaAtual + comprometidoFuturo;
      const pct = (totalComprometido / card.limite) * 100;
      if (pct >= 80) {
        msgs.push(`💳 *Limite de Cartão próximo do fim!*\nA fatura do seu cartão *${card.nome}* atingiu *${Math.round(pct)}%* do limite total (${formatBRL(totalComprometido)} de ${formatBRL(card.limite)}).`);
      }
    }
  }

  // N12 — Relatório Comparativo de Fechamento de Mês
  if (tipos.n12 !== false && day === 1) {
    const dtPassado = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const dtRetrasado = new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1);
    const mesPassadoStr = `${dtPassado.getFullYear()}-${String(dtPassado.getMonth()+1).padStart(2,'0')}`;
    const mesRetrasadoStr = `${dtRetrasado.getFullYear()}-${String(dtRetrasado.getMonth()+1).padStart(2,'0')}`;

    const calcGastoMes = (targetMonth) => {
      const fromStr = `${targetMonth}-01`;
      const [y, m] = targetMonth.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const toStr = `${targetMonth}-${String(lastDay).padStart(2, '0')}`;
      // Cartões com fatura real no mês — projeções virtuais desses são ignoradas
      const comFaturaReal = cartaoComFaturaRealNoMes(transactions, fromStr, toStr);
      const occs = expandRange(transactions, fromStr, toStr);
      return occs
        .filter(o => {
          if (o.tipo === 'entrada') return false;
          // Descarta projeção virtual de cartão que já tem fatura real no mês
          if (o.tx?.id?.includes('-proj-') && comFaturaReal.has(o.tx?.cartaoId)) return false;
          return true;
        })
        .reduce((sum, o) => sum + o.valor, 0);
    };

    const spentPassado = calcGastoMes(mesPassadoStr);
    const spentRetrasado = calcGastoMes(mesRetrasadoStr);

    const nomeMesPassado = dtPassado.toLocaleString('pt-BR', { month: 'long', timeZone: 'America/Sao_Paulo' });
    const nomeMesRetrasado = dtRetrasado.toLocaleString('pt-BR', { month: 'long', timeZone: 'America/Sao_Paulo' });

    if (spentRetrasado > 0) {
      const diffPct = ((spentPassado - spentRetrasado) / spentRetrasado) * 100;
      if (diffPct < 0) {
        msgs.push(`📊 *Relatório do Mês Anterior (${nomeMesPassado.toUpperCase()})*\nEconomia de *${Math.abs(Math.round(diffPct))}%* em relação a ${nomeMesRetrasado}! Gastos: ${formatBRL(spentPassado)} vs ${formatBRL(spentRetrasado)}. Parabéns! 🚀`);
      } else if (diffPct > 0) {
        msgs.push(`📊 *Relatório do Mês Anterior (${nomeMesPassado.toUpperCase()})*\nSeus gastos subiram *${Math.round(diffPct)}%* em relação a ${nomeMesRetrasado}. Gastos: ${formatBRL(spentPassado)} vs ${formatBRL(spentRetrasado)}. Fique atento neste mês! ⚠️`);
      }
    } else if (spentPassado > 0) {
      msgs.push(`📊 *Relatório do Mês Anterior (${nomeMesPassado.toUpperCase()})*\nGastos totais no mês recém-encerrado: *${formatBRL(spentPassado)}*.`);
    }
  }

  // ── N13 — Fatura fecha AMANHÃ ────────────────────────────────────────────────
  if (tipos.n13 !== false) {
    const d1 = new Date(hoje); d1.setDate(d1.getDate() + 1);
    for (const card of cards) {
      if (card.diaFechamento === d1.getDate()) {
        msgs.push(
          `⚠️ *Fatura fecha AMANHÃ!*\n${card.nome} — últimas horas para lançar compras nesta fatura!`
        );
      }
    }
  }

  // ── N14 — Última parcela paga hoje ───────────────────────────────────────────
  if (tipos.n14 !== false) {
    for (const tx of transactions) {
      if (tx.frequencia !== 'parcelado') continue;
      const parcAtual = tx.parcelaAtual || 1;
      const parcTotal = tx.totalParcelas || 1;
      if (parcAtual !== parcTotal) continue;          // não é a última
      
      const pd = new Date(tx.dataInicio + 'T00:00:00');
      // Data da parcela atual = dataInicio + (parcelaAtual - 1) meses
      const diffMonths = (tx.parcelaAtual || 1) - 1;
      for (let j = 0; j < diffMonths; j++) addOneMonthClamped(pd);
      const ds = dateStrFromDate(pd);
      if (ds !== todayStr) continue; // não vence hoje
      
      msgs.push(
        `🎉 *Última parcela!*\n${tx.descricao || 'Lançamento parcelado'} — a partir do próximo mês *${formatBRL(tx.valor)}* serão liberados no seu orçamento!`
      );
    }
  }

  // ── N15 — Saldo abaixo do mínimo configurado ─────────────────────────────────
  if (tipos.n15 !== false) {
    const saldoMinimo = Number(config.saldoMinimoAlerta ?? 200);
    if (saldoMinimo > 0) {
      const saldoAtual = calcSaldoSimples(transactions, todayStr, walletInitials);
      if (saldoAtual < saldoMinimo) {
        msgs.push(
          `🚨 *Saldo baixo!*\nSeu saldo atual é *${formatBRL(saldoAtual)}* — abaixo do mínimo de *${formatBRL(saldoMinimo)}*. Atenção ao caixa!`
        );
      }
    }
  }

  // ── N16 — Resumo das metas/caixinhas (dia 1 do mês) ─────────────────────────
  if (tipos.n16 !== false && day === 1 && goals.length > 0) {
    const metasComMeta = goals.filter(g => g.metaFinal > 0);
    if (metasComMeta.length > 0) {
      let texto = `🎯 *Resumo das Caixinhas — ${hoje.toLocaleString('pt-BR', { month: 'long', timeZone: 'America/Sao_Paulo' }).toUpperCase()}*\n\n`;
      for (const goal of metasComMeta) {
        const saldoMeta = transactions
          .filter(t => t.metaId === goal.id)
          .reduce((acc, t) => t.tipo === 'saida' ? acc - (Number(t.valor)||0) : acc + (Number(t.valor)||0), 0);
        const pct = Math.min(Math.round((saldoMeta / goal.metaFinal) * 100), 100);
        const { bar } = barra(saldoMeta, goal.metaFinal);
        const status = pct >= 100 ? '✅ Concluída!' : pct >= 75 ? '🔥 Quase lá!' : pct >= 50 ? '💪 Na metade!' : '🌱 Em andamento';
        texto += `*${goal.nome}*\n\`[${bar}] ${pct}%\` — ${formatBRL(saldoMeta)} de ${formatBRL(goal.metaFinal)} ${status}\n\n`;
      }
      texto += `_Acesse o app para aportar nas caixinhas!_`;
      msgs.push(texto.trim());
    }
  }

  // ── N17 — Balanço da metade do mês (dia 15) ──────────────────────────────────
  if (tipos.n17 !== false && day === 15) {
    const rendaMensal = config?.rendaMensal || 0;
    if (rendaMensal > 0) {
      const spent = computeSpentByCategory(transactions, currentMonth);
      const totalGasto = Object.values(spent).reduce((a, b) => a + b, 0);
      const pct        = Math.round((totalGasto / rendaMensal) * 100);
      // Projeção linear: gasto dos 15 dias × 2
      const projecao   = totalGasto * 2;
      const saldoProj  = rendaMensal - projecao;
      const nomeMes    = hoje.toLocaleString('pt-BR', { month: 'long', timeZone: 'America/Sao_Paulo' });
      const { bar }    = barra(totalGasto, rendaMensal);

      let msg = `📊 *Metade de ${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)}!*\n\n`;
      msg += `Gasto até agora: *${formatBRL(totalGasto)}* de *${formatBRL(rendaMensal)}*\n`;
      msg += `\`[${bar}] ${pct}%\`\n\n`;
      msg += `Projeção de fechamento: *${formatBRL(projecao)}*\n`;
      if (saldoProj >= 0) {
        msg += `✅ Projetando *${formatBRL(saldoProj)} de sobra* — bom ritmo!`;
      } else {
        msg += `⚠️ Projetando *extrapolar em ${formatBRL(-saldoProj)}* — atenção aos gastos!`;
      }
      msgs.push(msg);
    }
  }

  // ── N19 — Alerta de padrão incomum de gastos (dia atípico) ──────────────────
  if (tipos.n19 !== false) {
    const todayS2 = dateStrFromDate(hoje);
    const ago30   = (() => { const d = new Date(hoje); d.setDate(d.getDate() - 30); return dateStrFromDate(d); })();
    const occsHoje30 = expandRange(transactions, ago30, todayS2);
    const gastoHoje2 = occsHoje30.filter(o => o.date === todayS2 && o.tipo !== 'entrada')
      .reduce((s, o) => s + o.valor, 0);
    const somaUltimos30 = occsHoje30.filter(o => o.tipo !== 'entrada')
      .reduce((s, o) => s + o.valor, 0);
    const media = somaUltimos30 / 30;
    if (gastoHoje2 > media * 2 && gastoHoje2 > 50) {
      const mult = (gastoHoje2 / media).toFixed(1);
      let msg = `⚠️ *Dia atípico de gastos!*\n\n`;
      msg += `Você registrou *${formatBRL(gastoHoje2)}* hoje — `;
      msg += `*${mult}×* acima da sua média diária (${formatBRL(media)}).\n`;
      msg += `_Tudo planejado?_`;
      msgs.push(msg);
    }
  }

  // ── N20 — Progresso semanal das metas (toda sexta-feira) ─────────────────────
  if (tipos.n20 !== false && weekday === 5 && goals.length > 0) {
    const metasComMeta = goals.filter(g => g.metaFinal > 0);
    if (metasComMeta.length > 0) {
      let msg = `🎯 *Progresso das Metas — Semana*\n\n`;
      metasComMeta.forEach(g => {
        // g.saldo não é persistido no Firestore — calcula a partir das transações vinculadas
        const saldoMeta = transactions
          .filter(t => t.metaId === g.id)
          .reduce((acc, t) => t.tipo === 'saida' ? acc - (Number(t.valor) || 0) : acc + (Number(t.valor) || 0), 0);
        const pct = Math.min(100, Math.round((saldoMeta / g.metaFinal) * 100));
        const barF = Math.round(pct / 10);
        const barLine = '█'.repeat(barF) + '░'.repeat(10 - barF);
        msg += `${g.nome}: *${formatBRL(saldoMeta)}* / ${formatBRL(g.metaFinal)} (${pct}%)\n`;
        msg += `\`[${barLine}]\`\n\n`;
      });
      msgs.push(msg.trim());
    }
  }

  // ── N21 — Lembrete de conferência bancária (dia 20) ───────────────────────────
  if (tipos.n21 !== false && day === 20) {
    const currentMonthStr = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
    const fromConf = `${currentMonthStr}-01`;
    const lastDayConf = new Date(hoje.getFullYear(), hoje.getMonth()+1, 0).getDate();
    const toConf = `${currentMonthStr}-${String(lastDayConf).padStart(2,'0')}`;
    const todayStr21 = dateStrFromDate(hoje);
    const isConferido21 = (o) => {
      const tx = o.tx;
      if (!tx) return false;
      if (!tx.frequencia || tx.frequencia === 'unico' || tx.frequencia === 'parcelado') return !!tx.conferido;
      return !!(tx.conferidos && tx.conferidos.includes(o.date));
    };
    const occsConf = expandRange(transactions, fromConf, toConf);
    const pendentes = occsConf.filter(o => o.date <= todayStr21 && !isConferido21(o) && o.tipo !== 'entrada').length;
    if (pendentes > 0) {
      let msg = `📋 *Hora de conciliar seu extrato!*\n\n`;
      msg += `Você tem *${pendentes} lançamento${pendentes > 1 ? 's' : ''} pendente${pendentes > 1 ? 's' : ''}* de conferência neste mês.\n\n`;
      msg += `Confira seu extrato bancário e marque o que já foi debitado.\n`;
      msg += `_App → Histórico → filtro "Pendentes"_`;
      msgs.push(msg);
    }
  }

  return msgs;
}

// ─── N18 — Economia do dia (19h, todos os usuários) ──────────────────────────
function checkN18(transactions, config, tipos) {
  if (tipos.n18 === false) return [];

  const hoje      = getNowBrasilia();
  const todayS    = dateStrFromDate(hoje);
  const currentMonth = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
  const from      = `${currentMonth}-01`;

  // Verifica se uma ocorrência já foi conferida/paga
  const isConferido = (o) => {
    const tx = o.tx;
    if (!tx) return false;
    if (!tx.frequencia || tx.frequencia === 'unico' || tx.frequencia === 'parcelado') {
      return !!tx.conferido;
    }
    return !!(tx.conferidos && tx.conferidos.includes(o.date));
  };

  // Apenas despesas recorrentes (mensal/semanal/diario) não pagas = possível economia.
  // Lançamentos únicos (unico/parcelado) recém-registrados não são "economia" — são despesas pendentes.
  const isRecorrente  = (o) => o.tx && !['unico', 'parcelado'].includes(o.tx.frequencia);
  const occsHoje      = expandRange(transactions, todayS, todayS);
  const naoConfHoje   = occsHoje.filter(o => o.tipo !== 'entrada' && !isConferido(o) && isRecorrente(o));
  const economiaHoje  = naoConfHoje.reduce((s, o) => s + (Number(o.valor) || 0), 0);

  if (economiaHoje <= 0) return [];

  // Acumulado do mês até hoje (também só recorrentes)
  const occsMonth    = expandRange(transactions, from, todayS);
  const naoConfMes   = occsMonth.filter(o => o.tipo !== 'entrada' && !isConferido(o) && isRecorrente(o));
  const economiaMes  = naoConfMes.reduce((s, o) => s + (Number(o.valor) || 0), 0);

  const nomeMes  = hoje.toLocaleString('pt-BR', { month: 'long', timeZone: 'America/Sao_Paulo' });
  const mesLabel = nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1);

  let msg = `🎉 *Parabéns! Você economizou hoje!*\n\n`;
  msg += `Não foram registrados *${formatBRL(economiaHoje)}* em gastos previstos para hoje.\n\n`;
  msg += `📈 Economia acumulada em ${mesLabel}: *${formatBRL(economiaMes)}*\n`;
  msg += `_Continue assim!_`;

  return [msg];
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

async function loadUserData(uid) {
  const [txSnap, walletSnap] = await Promise.all([
    db.collection('transactions').doc(uid).collection('entries').get(),
    db.collection('wallets').where('userId', '==', uid).get(),
  ]);
  const transactions    = txSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const walletInitials  = walletSnap.docs.reduce((acc, d) => acc + (Number(d.data().saldoInicial) || 0), 0);
  return { transactions, walletInitials };
}

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
    if (o.tipo === 'entrada') entradas += o.valor;
    else                      saidas   += o.valor;
  }

  const nomeMes = now.toLocaleString('pt-BR', { month: 'long', timeZone: 'America/Sao_Paulo' });
  return sendMessage(chatId,
    `📊 *Resumo de ${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)}*\n\n` +
    `✅ Entradas: *${formatBRL(entradas)}*\n` +
    `❌ Saídas:   *${formatBRL(saidas)}*\n` +
    `💰 Balanço:  *${formatBRL(entradas - saidas)}*`
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
      if (o.tipo === 'entrada') entradas += o.valor; else saidas += o.valor;
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
  const occs = expandRange(transactions, fromStr, hoje);

  let entradas = 0, saidas = 0;
  const byDay = {};

  for (const o of occs) {
    if (!byDay[o.date]) byDay[o.date] = { e: 0, s: 0 };
    if (o.tipo === 'entrada') { entradas += o.valor; byDay[o.date].e += o.valor; }
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
    if (o.tipo === 'entrada') entradas += o.valor;
    else                      saidas   += o.valor;
  }

  const nomeMes = MESES_LONGO[month];
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

async function handleProjecao(chatId, uid) {
  const agora = getNowBrasilia();
  const hoje  = dateStrFromDate(agora);

  const { transactions: txs, walletInitials } = await loadUserData(uid);

  const saldoHoje = calcSaldoSimples(txs, hoje, walletInitials);

  // Saldo mínimo dos próximos 7 dias (para escalar a barra)
  const saldos = [];
  for (let i = 1; i <= 7; i++) {
    const dt  = new Date(agora); dt.setDate(agora.getDate() + i);
    saldos.push({ dt, saldo: calcSaldoSimples(txs, dateStrFromDate(dt), walletInitials) });
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

async function handleInsight(chatId, uid) {
  const agora = getNowBrasilia();
  const mesStr = `${agora.getFullYear()}-${String(agora.getMonth()+1).padStart(2,'0')}`;

  const configDoc = await db.collection('config').doc(uid).get();
  const config    = configDoc.exists ? configDoc.data() : {};
  const renda     = config.rendaMensal || 0;
  const pcts      = config.budgetPcts  || {};

  if (renda <= 0) {
    return sendMessage(chatId, '💡 *Dica:* Defina sua renda mensal no app para receber insights de orçamento personalizados!');
  }

  const txSnap = await db.collection('transactions').doc(uid).collection('entries').get();
  const txs    = txSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const spent  = computeSpentByCategory(txs, mesStr);

  const worst = { catId: null, pct: 0, s: 0, budget: 0 };
  for (const catId of CATEGORY_ORDER) {
    const budget = (renda * (Number(pcts[catId]) || 0)) / 100;
    if (budget <= 0) continue;
    const s = spent[catId] || 0;
    const pct = (s / budget) * 100;
    if (pct > worst.pct) {
      worst.catId = catId;
      worst.pct = pct;
      worst.s = s;
      worst.budget = budget;
    }
  }

  const LABELS = {
    liberdade: '💎 Liberdade', custos_fixos: '🏠 Custos Fixos', conforto: '🛋 Conforto',
    metas: '🎯 Metas', prazeres: '🎉 Prazeres', conhecimento: '📚 Conhecimento',
  };

  const diasNoMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate();
  const restDias = diasNoMes - agora.getDate();

  let text = '💡 *Insight Financeiro Matoba*\n\n';
  if (worst.catId) {
    const label = LABELS[worst.catId];
    const top = getTopExpensesForCategory(txs, worst.catId, mesStr);
    const topStr = top ? `\nPrincipais despesas que pesaram: _${top}_.\n` : '';
    if (worst.pct > 100) {
      text += `🚨 A categoria *${label}* já estourou em *${formatBRL(worst.s - worst.budget)}* (${Math.round(worst.pct)}% do planejado).${topStr}\n`;
      text += `👉 _Recomendação: Para compensar, tente reduzir saídas em outras categorias ou remanejar o saldo até o fim do mês._`;
    } else if (worst.pct >= 80) {
      text += `⚠️ Alerta: *${label}* consumiu *${Math.round(worst.pct)}%* do limite. Você tem apenas *${formatBRL(worst.budget - worst.s)}* para os próximos ${restDias} dias. ${topStr}\n`;
      text += `👉 _Recomendação: Tente evitar compras impulsivas e adiar despesas nessa categoria para o mês seguinte._`;
    } else {
      text += `✅ Excelente! Todas as categorias de orçamento estão saudáveis e abaixo de 80% do limite.\n\n`;
      text += `👉 _Recomendação: Continue assim! Seu controle está muito firme e no ritmo ideal._`;
    }
  } else {
    text += `🌱 Você ainda não realizou gastos com categorias orçamentárias este mês. Aproveite para planejar seus aportes!`;
  }

  return sendMessage(chatId, text);
}

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
    const { faturaAtual, comprometidoFuturo, proximoVenc, prevVenc } = calcFaturaCardBot(card, txs, today);

    // Lançamentos reais na janela do ciclo atual
    const cardTxsWindow = txs.filter(
      t => t.tipo === 'cartao' && t.cartaoId === card.id && !t.conferido
        && t.dataInicio > prevVenc && t.dataInicio <= proximoVenc
    );

    // Se sem real, usa parcelas projetadas via expandRange
    let items = [];
    let isVirtual = false;
    if (cardTxsWindow.length > 0) {
      cardTxsWindow.forEach(tx => {
        if (tx.itens?.length > 0) {
          tx.itens.forEach(item => items.push(item));
        } else {
          items.push({ descricao: tx.descricao || 'Despesa Cartão', valor: tx.valor, dataCompra: tx.dataInicio });
        }
      });
    } else {
      isVirtual = true;
      const occs = expandRange(
        txs.filter(t => t.tipo === 'cartao' && t.cartaoId === card.id && !t.conferido && t.dataInicio <= prevVenc),
        prevVenc, proximoVenc
      ).filter(o => o.date > prevVenc && o.date <= proximoVenc);
      occs.forEach(o => {
        if (o.tx?.itens?.length > 0) {
          o.tx.itens.forEach(item => items.push(item));
        }
      });
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

// ─── Configuração de alertas via bot (menu interativo inline) ─────────────────

const DEFAULT_TG_TIPOS = {
  n1:true,n2:true,n3:true,n4:true,n5:true,n6:true,n7:true,
  n8:true,n9:true,n10:true,n11:true,n12:true,
  n13:true,n14:true,n15:true,n16:true,n17:true,n18:true,
  n19:true,n20:true,n21:true,
};

const ALERT_LABELS = {
  n1:'Fatura vence hoje',   n2:'Vence em X dias',      n3:'Fecha em 2 dias',
  n4:'Orçamento >80%',      n5:'Orçamento estourado',  n6:'Saldo negativo 7d',
  n7:'Resumo semanal',      n8:'Resumo diário',         n9:'Limite geral gastos',
  n10:'Contas fixas',       n11:'Cartão no limite',     n12:'Rel. mensal',
  n13:'Fecha amanhã',       n14:'Última parcela',       n15:'Saldo mínimo',
  n16:'Caixinhas (dia 1)',  n17:'Metade do mês',        n18:'Economia do dia',
  n19:'Gasto atípico do dia', n20:'Progresso metas (sex)', n21:'Conferência (dia 20)',
};

// Grupos de alertas para organizar o menu
const ALERT_GROUPS = [
  { emoji:'💳', title:'Cartão',        ids:['n1','n2','n3','n13'] },
  { emoji:'💰', title:'Orçamento',     ids:['n4','n5','n9'] },
  { emoji:'⚠️', title:'Alertas',       ids:['n6','n10','n11','n14','n15'] },
  { emoji:'📊', title:'Resumos',       ids:['n7','n8','n12','n16','n17'] },
  { emoji:'💚', title:'Economia',      ids:['n18','n19'] },
  { emoji:'🎯', title:'Metas e Banco', ids:['n20','n21'] },
];

// Texto do menu de configuração
function buildConfigText(tipos) {
  let t = `⚙️ *Configurar Alertas do Telegram*\n`;
  t += `_Toque em um alerta para ativar ✅ ou desativar ❌_\n\n`;
  for (const g of ALERT_GROUPS) {
    t += `${g.emoji} *${g.title}*\n`;
    for (const id of g.ids) {
      t += `${tipos[id] !== false ? '✅' : '❌'} ${ALERT_LABELS[id]}\n`;
    }
    t += '\n';
  }
  const ativos = Object.values(tipos).filter(v => v !== false).length;
  t += `_${ativos} de ${Object.keys(ALERT_LABELS).length} alertas ativos_`;
  return t.trim();
}

// Teclado inline com botões de toggle por grupo (2 por linha)
function buildConfigKeyboard(tipos) {
  const rows = [];
  for (const g of ALERT_GROUPS) {
    // Cabeçalho do grupo como botão desabilitado (apenas texto)
    rows.push([{ text: `${g.emoji} ${g.title}`, callback_data: 'noop' }]);
    // Botões de toggle, 2 por linha
    for (let i = 0; i < g.ids.length; i += 2) {
      const row = [];
      for (let j = i; j < Math.min(i + 2, g.ids.length); j++) {
        const id = g.ids[j];
        const on = tipos[id] !== false;
        row.push({ text: `${on ? '✅' : '❌'} ${ALERT_LABELS[id]}`, callback_data: `tgl_${id}` });
      }
      rows.push(row);
    }
  }
  // Botões de ação globais
  rows.push([
    { text: '✅ Ativar todos',   callback_data: 'cfg_all_on'  },
    { text: '❌ Desativar todos', callback_data: 'cfg_all_off' },
  ]);
  rows.push([{ text: '✔️ Pronto — fechar menu', callback_data: 'cfg_done' }]);
  return { inline_keyboard: rows };
}

// Lê telegramTipos do Firestore (com defaults)
async function getTelegramTipos(uid) {
  const configDoc = await db.collection('config').doc(uid).get();
  const prefs     = configDoc.exists ? (configDoc.data().notificacoes || {}) : {};
  return { ...DEFAULT_TG_TIPOS, ...(prefs.telegramTipos ?? prefs.tipos ?? {}) };
}

// Salva telegramTipos no Firestore
async function saveTelegramTipos(uid, tipos) {
  const configDoc = await db.collection('config').doc(uid).get();
  const prefs     = configDoc.exists ? (configDoc.data().notificacoes || {}) : {};
  await db.collection('config').doc(uid).set(
    { notificacoes: { ...prefs, telegramTipos: tipos } },
    { merge: true }
  );
}

async function handleConfigurar(chatId, uid) {
  const tipos = await getTelegramTipos(uid);
  return tgFetch('sendMessage', {
    chat_id:      chatId,
    text:         buildConfigText(tipos),
    parse_mode:   'Markdown',
    reply_markup: buildConfigKeyboard(tipos),
  });
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

// ─── Novos handlers ───────────────────────────────────────────────────────────

async function handleProximas(chatId, uid) {
  const hoje     = todayStrBrasilia();
  const fim7     = addDaysFn(hoje, 6);
  const { transactions, walletInitials } = await loadUserData(uid);
  const saldo    = calcSaldoSimples(transactions, hoje, walletInitials);

  // Começa em amanhã: saldo já inclui hoje via calcSaldoSimples — evita dupla-contagem
  const amanha = addDaysFn(hoje, 1);
  const occs = expandRange(transactions, amanha, fim7)
    .filter(o => o.tipo !== 'entrada')
    .sort((a, b) => a.date.localeCompare(b.date));

  if (occs.length === 0) {
    return sendMessage(chatId, '📅 *Próximos 7 dias*\n\n✅ Nenhuma despesa prevista nos próximos 7 dias!');
  }

  const DIAS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  let totalSaidas = 0;
  let text = `📅 *Próximos 7 dias*\n\n`;

  // Agrupa por data
  const byDate = {};
  occs.forEach(o => { if (!byDate[o.date]) byDate[o.date] = []; byDate[o.date].push(o); });

  Object.entries(byDate).forEach(([date, items]) => {
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const dayName = DIAS[dt.getDay()];
    const dateLabel = `${dayName}, ${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}`;
    const dayTotal = items.reduce((s, o) => s + o.valor, 0);
    totalSaidas += dayTotal;
    text += `*${dateLabel}* — ${formatBRL(dayTotal)}\n`;
    items.forEach(o => {
      const desc = o.tx?.descricao || o.tipo;
      text += `  • ${desc}\n`;
    });
    text += '\n';
  });

  text += `─────────────────\n`;
  text += `💸 Total previsto: *${formatBRL(totalSaidas)}*\n`;
  text += `💰 Saldo esperado: *${formatBRL(saldo - totalSaidas)}*`;

  return sendMessage(chatId, text.trim());
}

async function handlePrevisao(chatId, uid) {
  const hoje   = todayStrBrasilia();
  const fim30  = addDaysFn(hoje, 29);
  const { transactions, walletInitials } = await loadUserData(uid);
  const saldoHoje = calcSaldoSimples(transactions, hoje, walletInitials);

  // Começa em amanhã: saldoHoje já inclui hoje via calcSaldoSimples — evita dupla-contagem
  const occs = expandRange(transactions, addDaysFn(hoje, 1), fim30);
  let entradas = 0, saidas = 0;
  let diaMaisCritico = null, maiorSaidaDia = 0;

  const byDate = {};
  occs.forEach(o => {
    if (!byDate[o.date]) byDate[o.date] = 0;
    if (o.tipo !== 'entrada') byDate[o.date] += o.valor;
  });

  occs.forEach(o => {
    if (o.tipo === 'entrada') entradas += o.valor;
    else saidas += o.valor;
  });

  Object.entries(byDate).forEach(([date, val]) => {
    if (val > maiorSaidaDia) { maiorSaidaDia = val; diaMaisCritico = date; }
  });

  const saldoFim = saldoHoje + entradas - saidas;
  const tendencia = saldoFim >= saldoHoje ? '✅ Positiva' : '⚠️ Negativa';

  let diaCriticoStr = '';
  if (diaMaisCritico) {
    const [, m, d] = diaMaisCritico.split('-');
    diaCriticoStr = `\n⚠️ Dia mais crítico: *${String(d).padStart(2,'0')}/${m}* (${formatBRL(maiorSaidaDia)})`;
  }

  return sendMessage(chatId,
    `📊 *Projeção — próximos 30 dias*\n\n` +
    `💰 Saldo hoje: *${formatBRL(saldoHoje)}*\n` +
    `📈 Entradas previstas: *${formatBRL(entradas)}*\n` +
    `📉 Saídas previstas: *${formatBRL(saidas)}*\n` +
    `─────────────────\n` +
    `🏁 Saldo em 30 dias: *${formatBRL(saldoFim)}*` +
    diaCriticoStr + `\n` +
    `${tendencia}`
  );
}

async function handleEconomias(chatId, uid) {
  const { transactions } = await loadUserData(uid);
  const configDoc = await db.collection('config').doc(uid).get();
  const config = configDoc.exists ? configDoc.data() : {};

  // Calcula economia do N18
  const msgs = checkN18(transactions, config, { n18: true });

  const rendaMensal = config?.rendaMensal || 0;
  const pctLiberdade = config?.budgetPcts?.liberdade || 25;
  const metaMensal = rendaMensal > 0 ? (rendaMensal * pctLiberdade / 100) : 0;

  // Investimentos do mês
  const hoje = getNowBrasilia();
  const monthStr = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
  const from = `${monthStr}-01`;
  const lastDay = new Date(hoje.getFullYear(), hoje.getMonth()+1, 0).getDate();
  const to = `${monthStr}-${String(lastDay).padStart(2,'0')}`;
  const occsInv = expandRange(transactions, from, to).filter(o => o.tipo === 'investimento');
  const investido = occsInv.reduce((s, o) => s + o.valor, 0);

  const nomeMes = hoje.toLocaleString('pt-BR', { month: 'long', timeZone: 'America/Sao_Paulo' });
  const mesLabel = nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1);

  let text = msgs.length > 0 ? msgs[0] + '\n\n' : `💚 *Economia de ${mesLabel}*\n\n_Nenhum gasto previsto não registrado hoje._\n\n`;

  if (metaMensal > 0) {
    const pct = Math.min(100, Math.round((investido / metaMensal) * 100));
    const barFilled = Math.round(pct / 10);
    const bar = '█'.repeat(barFilled) + '░'.repeat(10 - barFilled);
    text += `🎯 *Meta mensal de poupança:* ${formatBRL(metaMensal)}\n`;
    text += `Investido: *${formatBRL(investido)}*\n`;
    text += `Progresso: \`[${bar}] ${pct}%\``;
    if (investido >= metaMensal) text += `\n✅ Meta atingida!`;
  }

  return sendMessage(chatId, text.trim());
}

// Mapa de nomes de meses em PT para número
const MESES_NOME_MAP = {
  jan:1,fev:2,mar:3,abr:4,mai:5,jun:6,
  jul:7,ago:8,set:9,out:10,nov:11,dez:12,
  janeiro:1,fevereiro:2,março:3,marco:3,abril:4,maio:5,junho:6,
  julho:7,agosto:8,setembro:9,outubro:10,novembro:11,dezembro:12,
};

async function handleSaldoFinal(chatId, uid, args) {
  const agora  = getNowBrasilia();
  const hoje   = dateStrFromDate(agora);
  const { transactions, walletInitials } = await loadUserData(uid);

  // ── Analisa os argumentos ─────────────────────────────────────────────────
  let meses = [];
  const raw = (args || '').trim().toLowerCase();

  if (!raw) {
    // Padrão: mês atual + 5 seguintes (6 ao total)
    for (let i = 0; i < 6; i++) {
      const d = new Date(agora.getFullYear(), agora.getMonth() + i, 1);
      meses.push({ ano: d.getFullYear(), mes: d.getMonth() + 1 });
    }
  } else if (/^(ano|todos|all)$/.test(raw)) {
    // Todos os meses do ano corrente
    for (let m = 1; m <= 12; m++) {
      meses.push({ ano: agora.getFullYear(), mes: m });
    }
  } else {
    // Tokens: números (1-12) ou nomes de meses
    const tokens = raw.split(/[\s,;]+/).filter(Boolean);
    const seen = new Set();
    for (const t of tokens) {
      let m = parseInt(t);
      if (isNaN(m)) m = MESES_NOME_MAP[t] || 0;
      if (m < 1 || m > 12) continue;
      if (seen.has(m)) continue;
      seen.add(m);
      // Se o mês já passou neste ano, usa próximo ano
      const mesAtual = agora.getMonth() + 1;
      const ano = m < mesAtual ? agora.getFullYear() + 1 : agora.getFullYear();
      meses.push({ ano, mes: m });
    }
    meses.sort((a, b) => (a.ano * 100 + a.mes) - (b.ano * 100 + b.mes));

    if (meses.length === 0) {
      return sendMessage(chatId,
        `❓ Não entendi os meses informados.\n\n` +
        `*Exemplos de uso:*\n` +
        `/saldofinal — próximos 6 meses\n` +
        `/saldofinal 6 7 8 — junho, julho e agosto\n` +
        `/saldofinal junho — só junho\n` +
        `/saldofinal ano — todos os meses do ano`
      );
    }
  }

  // Limita a 12 meses para não gerar mensagem gigante
  if (meses.length > 12) meses = meses.slice(0, 12);

  // ── Calcula saldo para cada fim de mês ────────────────────────────────────
  // saldo "anterior" = saldo atual para calcular o delta do primeiro mês
  let saldoAnterior = calcSaldoSimples(transactions, hoje, walletInitials);

  const linhas = meses.map(({ ano, mes }) => {
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const endStr    = `${ano}-${String(mes).padStart(2,'0')}-${String(ultimoDia).padStart(2,'0')}`;
    const saldo     = calcSaldoSimples(transactions, endStr, walletInitials);
    const delta     = saldo - saldoAnterior;
    saldoAnterior   = saldo;
    const isPast    = endStr < hoje;
    return { ano, mes, saldo, delta, isPast };
  });

  // ── Monta mensagem ────────────────────────────────────────────────────────
  const titulo = meses.length === 1
    ? `📅 *Saldo — Fim de ${MESES_LONGO[meses[0].mes]} ${meses[0].ano}*`
    : `📅 *Saldo Projetado — Fim de Mês*`;

  let text = titulo + `\n\n`;

  for (const { ano, mes, saldo, delta, isPast } of linhas) {
    const nomeMes  = MESES_LONGO[mes];
    const saldoFmt = formatBRL(saldo);
    const deltaFmt = `${delta >= 0 ? '+' : ''}${formatBRL(delta)}`;
    const icon     = saldo < 0 ? '🔴' : delta >= 0 ? '✅' : '⚠️';
    const arrow    = delta > 50 ? '▲' : delta < -50 ? '▼' : '➡️';
    const pastTag  = isPast ? ' _(histórico)_' : '';

    text += `${icon} *${nomeMes} ${ano}*${pastTag}\n`;
    text += `   Saldo: *${saldoFmt}*\n`;
    text += `   ${arrow} ${deltaFmt} em relação ao mês anterior\n\n`;
  }

  // Resumo quando há mais de um mês
  if (linhas.length > 1) {
    const primeiro = linhas[0];
    const ultimo   = linhas[linhas.length - 1];
    const evolucao = ultimo.saldo - calcSaldoSimples(transactions, hoje, walletInitials);
    const tendIcon = evolucao >= 0 ? '📈' : '📉';
    text += `─────────────────\n`;
    text += `${tendIcon} Evolução no período: *${evolucao >= 0 ? '+' : ''}${formatBRL(evolucao)}*\n`;
    text += `_(de ${MESES_CURTO[primeiro.mes]} a ${MESES_CURTO[ultimo.mes]}/${ultimo.ano})_`;
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

  // ── 1. Itens parcelados de cartão ────────────────────────────────────────
  // Agrupa por (cartaoId, descrição, totalParcelas) e mantém o maior parcelaAtual
  // (= estado mais recente dentre faturas não pagas)
  const cartaoMap = {};
  txs
    .filter(t => t.tipo === 'cartao' && !t.conferido && t.itens?.length > 0)
    .forEach(tx => {
      tx.itens.forEach(item => {
        if (!item.isParcelado || !item.totalParcelas) return;
        const key = `${tx.cartaoId}|${(item.descricao || '').trim().toLowerCase()}|${item.totalParcelas}`;
        const cur = cartaoMap[key];
        if (!cur || (item.parcelaAtual || 1) > (cur.parcelaAtual || 1)) {
          cartaoMap[key] = {
            cartaoId:     tx.cartaoId,
            descricao:    item.descricao || tx.descricao || 'Item',
            valor:        Number(item.valor) || 0,
            parcelaAtual: item.parcelaAtual || 1,
            totalParcelas: item.totalParcelas,
          };
        }
      });
    });

  // "Restam" inclui a parcela atual (ainda não conferida) + as futuras
  const cartaoItems = Object.values(cartaoMap).filter(
    p => p.totalParcelas >= p.parcelaAtual
  );

  // ── 2. Parcelados avulsos (frequencia === 'parcelado', fora de cartão) ───
  const avulsos = txs
    .filter(t => t.frequencia === 'parcelado' && t.tipo !== 'cartao')
    .map(t => ({
      descricao:    t.descricao || 'Parcelado',
      valor:        Number(t.valor) || 0,
      parcelaAtual: t.parcelaAtual || 1,
      totalParcelas: t.totalParcelas || 1,
    }))
    .filter(p => p.parcelaAtual <= p.totalParcelas); // inclui última parcela ainda em aberto

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
    items.sort((a, b) =>
      (b.totalParcelas - b.parcelaAtual + 1) * b.valor -
      (a.totalParcelas - a.parcelaAtual + 1) * a.valor
    );
    for (const p of items) {
      const restam      = p.totalParcelas - p.parcelaAtual + 1; // atual + futuras
      const totalRestante = restam * p.valor;
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
    avulsos.sort((a, b) =>
      (b.totalParcelas - b.parcelaAtual + 1) * b.valor -
      (a.totalParcelas - a.parcelaAtual + 1) * a.valor
    );
    for (const p of avulsos) {
      const restam        = p.totalParcelas - p.parcelaAtual + 1;
      const totalRestante = restam * p.valor;
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

// Helper: adiciona dias a uma string de data
function addDaysFn(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}

async function handleAjuda(chatId) {
  const MAIN_KEYBOARD = {
    keyboard: [
      [{ text: '💰 Saldo' },      { text: '💳 Cartões' },   { text: '🧾 Fatura' }],
      [{ text: '📊 Categorias' }, { text: '🎯 Metas' },     { text: '📈 Projeção' }],
      [{ text: '💡 Insight' },    { text: '📋 Parcelados' },{ text: '📅 Saldo Fim Mês' }],
      [{ text: '⚙️ Configurar' }],
      [{ text: '❓ Ajuda' }],
    ],
    resize_keyboard: true,
  };
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
    `/meta — Status de cada meta da Divisão Percentual\n` +
    `/insight — Dicas e análises dinâmicas de gastos 💡\n\n` +

    `*💳 Cartões de Crédito*\n` +
    `/cartoes — Seus cartões, limites e vencimentos\n` +
    `/fatura — Detalhamento de faturas e compras do ciclo atual 🧾\n` +
    `/parcelados — Compras parceladas em aberto: parcelas restantes e valores 📋\n\n` +

    `*📈 Projeção e Economia*\n` +
    `/saldofinal — Saldo projetado no fim de cada mês 📅\n` +
    `/projecao — Saldo projetado nos próximos 7 dias\n` +
    `/proximas — Próximas despesas dos próximos 7 dias\n` +
    `/previsao — Fluxo de caixa para os próximos 30 dias\n` +
    `/economias — Gastos não registrados e meta de poupança\n\n` +

    `*⚙️ Configurações*\n` +
    `/configurar — Ativar/desativar alertas diretamente aqui no Telegram\n\n` +

    `📱 *Para adicionar ou editar lançamentos use o app:*\n` +
    `👉 ${APP_URL}\n\n` +
    `_Para desvincular: Configurações → Bot do Telegram → Desvincular_`,
    { reply_markup: MAIN_KEYBOARD }
  );
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
      if (/7h|manhã|7\b/i.test(text))   return 7;
      if (/12h|tarde|12\b/i.test(text)) return 12;
      if (/19h|noite|19\b/i.test(text)) return 19;
      return INVALID;
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
async function completeOnboarding(chatId, uid, data) {
  await db.collection('users').doc(uid).update({
    telegramOnboarding: admin.firestore.FieldValue.delete(),
  });
  await db.collection('config').doc(uid).set(
    { notificacoes: { telegramEnabled: true, ...data } },
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
  await db.collection('users').doc(uid).set(
    { telegramOnboarding: { active: true, stepId: nextId, data } },
    { merge: true }
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
    { merge: true }
  );

  return sendMessage(chatId, step.msg(newSel), { reply_markup: step.buildKb(newSel) });
}

async function startOnboarding(chatId, uid, email, fromUser) {
  await db.collection('users').doc(uid).set(
    { telegramOnboarding: { active: true, stepId: 'horario', data: {} } },
    { merge: true }
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
}

// Desativa a integração do Telegram para um usuário que bloqueou o bot ou cujo chat não existe mais
async function disableTelegramForUser(uid) {
  try {
    await db.collection('users').doc(uid).set({
      telegramChatId: admin.firestore.FieldValue.delete(),
      telegramName: admin.firestore.FieldValue.delete(),
      telegramLinkedAt: admin.firestore.FieldValue.delete(),
    }, { merge: true });

    const configDoc = await db.collection('config').doc(uid).get();
    if (configDoc.exists) {
      const prefs = configDoc.data().notificacoes || {};
      await db.collection('config').doc(uid).set({
        notificacoes: {
          ...prefs,
          telegramEnabled: false,
        }
      }, { merge: true });
    }
    logger.info(`[TELEGRAM] Integração desativada com sucesso para o usuário uid=${uid}`);
  } catch (err) {
    logger.error(`[TELEGRAM] Erro ao desativar integração para o usuário uid=${uid}:`, err);
  }
}

// ─── EXPORT 1: Webhook HTTPS ──────────────────────────────────────────────────
// invoker: 'public' — permite chamadas não autenticadas (necessário para o Telegram)
exports.telegramWebhook = onRequest(
  { region: REGION, timeoutSeconds: 30, invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') { res.sendStatus(405); return; }

    // Validação de token secreto para segurança do webhook (evita spoofing)
    const secretToken = process.env.TELEGRAM_SECRET_TOKEN;
    if (secretToken) {
      const headerToken = req.headers['x-telegram-bot-api-secret-token'];
      if (headerToken !== secretToken) {
        logger.warn('[TG webhook] Requisição não autorizada — secret token incorreto ou ausente.');
        res.sendStatus(403);
        return;
      }
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
            const pushMsgs  = checkNotifications(cards, transactions, config, pushPrefs, goals, walletInitials);
            for (const msg of pushMsgs) {
              try {
                await sendPushNotification(fcmToken, msg);
              } catch (pushErr) {
                logger.error(`[PUSH] Erro FCM uid=${uid}:`, pushErr);
                const code = pushErr?.errorInfo?.code || pushErr?.code;
                if (code === 'messaging/registration-token-not-registered' ||
                    code === 'messaging/invalid-registration-token') {
                  await userDoc.ref.set({
                    fcmToken: admin.firestore.FieldValue.delete(),
                    fcmUpdatedAt: admin.firestore.FieldValue.delete(),
                  }, { merge: true });
                }
              }
            }
            if (pushMsgs.length > 0)
              logger.info(`[PUSH] uid=${uid}: ${pushMsgs.length} alerta(s) enviado(s)`);
          }

          // Telegram
          if (telegramEnabled) {
            const tgTipos = prefs.telegramTipos !== undefined ? prefs.telegramTipos : (prefs.tipos || {});
            const tgPrefs = { ...prefs, tipos: tgTipos };
            const tgMsgs  = checkNotifications(cards, transactions, config, tgPrefs, goals, walletInitials);
            let tgBlocked = false;
            for (const msg of tgMsgs) {
              const tgRes = await sendMessage(chatId, msg);
              if (tgRes && tgRes.ok === false) {
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
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
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
          fcmToken: admin.firestore.FieldValue.delete(),
          fcmUpdatedAt: admin.firestore.FieldValue.delete(),
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
