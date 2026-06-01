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
 */
function addOneMonthClamped(cur) {
  const day = cur.getDate();
  cur.setDate(1); // evita overflow ao mudar o mês
  cur.setMonth(cur.getMonth() + 1);
  const lastDay = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
  cur.setDate(Math.min(day, lastDay));
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
        addOneMonthClamped(cur);
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
        for (let j = 0; j < i; j++) addOneMonthClamped(pd);
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
          // Conta apenas se a FATURA (tx.dataInicio) é do mês atual.
          // Não itera meses futuros — cada mês tem sua própria fatura.
          if (tx.dataInicio?.startsWith(currentMonth)) {
            totals[cat] += Number(item.valor) || 0;
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

// ─── Verificações de notificação (N1-N17) ───────────────────────────────────
function checkNotifications(cards, transactions, config, prefs, goals = []) {
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
      const v = Number(tx.valor) || 0;
      if (!v || !tx.dataInicio) continue;

      if (tx.frequencia === 'unico' || tx.frequencia === 'parcelado') {
        // Lançamento único ou parcela: verifica se cai na janela
        if (tx.dataInicio > todayStr && tx.dataInicio <= in7) saidas7 += v;

      } else if (tx.frequencia === 'mensal') {
        // Verifica mês corrente E mês seguinte para cobrir qualquer janela de 7 dias
        const txDay = parseInt(tx.dataInicio.split('-')[2], 10);
        for (let delta = 0; delta <= 1; delta++) {
          const occ = new Date(hoje.getFullYear(), hoje.getMonth() + delta, txDay);
          const ds  = dateStrFromDate(occ);
          const inWindow    = ds > todayStr && ds <= in7;
          const afterStart  = ds >= tx.dataInicio;
          const beforeEnd   = !tx.dataFim || ds <= tx.dataFim;
          if (inWindow && afterStart && beforeEnd) saidas7 += v;
        }

      } else if (tx.frequencia === 'semanal') {
        // Avança da dataInicio até o primeiro dia futuro, depois verifica janela
        let cur = new Date(tx.dataInicio + 'T00:00:00');
        const endDate = tx.dataFim ? tx.dataFim : in7;
        // Pula para próxima ocorrência futura sem loop desnecessário
        while (dateStrFromDate(cur) <= todayStr) cur.setDate(cur.getDate() + 7);
        while (dateStrFromDate(cur) <= in7) {
          const ds = dateStrFromDate(cur);
          if (ds <= endDate) saidas7 += v;
          cur.setDate(cur.getDate() + 7);
        }
      }
    }

    const saldoProjetado = saldoAtual - saidas7;
    if (saldoProjetado < 0) {
      msgs.push(`📉 *Alerta: saldo pode ficar negativo!*\nSaldo atual ${formatBRL(saldoAtual)} · Saídas previstas ${formatBRL(saidas7)} · Projeção *${formatBRL(saldoProjetado)}* em 7 dias.`);
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
        // Expande ocorrências mensais dentro da janela
        let cur = new Date(tx.dataInicio + 'T00:00:00');
        const endDate = tx.dataFim && tx.dataFim < todayStr ? tx.dataFim : todayStr;
        while (dateStrFromDate(cur) <= endDate) {
          const ds = dateStrFromDate(cur);
          if (ds >= fromStr) {
            if (isEnt) entradas += v; else saidas += v;
          }
          addOneMonthClamped(cur);
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
      let totalGasto = 0;
      // 1. Saídas avulsas do mês atual
      for (const tx of transactions) {
        if (tx.tipo === 'entrada' || tx.tipo === 'cartao') continue;
        const v = Number(tx.valor) || 0;
        if (!v || !tx.dataInicio) continue;
        
        if (tx.frequencia === 'unico' || tx.frequencia === 'parcelado') {
          if (tx.dataInicio.startsWith(currentMonth)) totalGasto += v;
        } else if (tx.frequencia === 'mensal') {
          if (tx.dataInicio <= todayStr) {
            const end = tx.dataFim && tx.dataFim < todayStr ? tx.dataFim : todayStr;
            let cur = new Date(tx.dataInicio + 'T00:00:00');
            while (dateStrFromDate(cur) <= end) {
              const curStr = dateStrFromDate(cur);
              if (curStr.startsWith(currentMonth)) totalGasto += v;
              addOneMonthClamped(cur);
            }
          }
        }
      }
      // 2. Faturas de cartões do mês atual
      for (const card of cards) {
        const cardTxs = transactions.filter(t => t.tipo === 'cartao' && t.cartaoId === card.id);
        cardTxs.forEach(tx => {
          const txMonth = tx.dataInicio.slice(0, 7);
          if (txMonth === currentMonth) {
            if (tx.itens && tx.itens.length > 0) {
              tx.itens.forEach(item => {
                totalGasto += Number(item.valor) || 0;
              });
            } else {
              totalGasto += Number(tx.valor) || 0;
            }
          }
        });
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
      
      const cardTxs = transactions.filter(t => t.tipo === 'cartao' && t.cartaoId === card.id);
      let faturaAtual = 0;
      cardTxs.forEach(tx => {
        const txMonth = tx.dataInicio.slice(0, 7);
        if (txMonth === currentMonth) {
          if (tx.itens && tx.itens.length > 0) {
            tx.itens.forEach(item => {
              faturaAtual += Number(item.valor) || 0;
            });
          } else {
            faturaAtual += Number(tx.valor) || 0;
          }
        }
      });

      const pct = (faturaAtual / card.limite) * 100;
      if (pct >= 80) {
        msgs.push(`💳 *Limite de Cartão próximo do fim!*\nA fatura do seu cartão *${card.nome}* atingiu *${Math.round(pct)}%* do limite total (${formatBRL(faturaAtual)} de ${formatBRL(card.limite)}).`);
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
      let total = 0;
      for (const tx of transactions) {
        if (tx.tipo === 'entrada' || tx.tipo === 'cartao') continue;
        const v = Number(tx.valor) || 0;
        if (!v || !tx.dataInicio) continue;
        
        if (tx.frequencia === 'unico' || tx.frequencia === 'parcelado') {
          if (tx.dataInicio.startsWith(targetMonth)) total += v;
        } else if (tx.frequencia === 'mensal') {
          if (tx.dataInicio <= todayStr) {
            const end = tx.dataFim && tx.dataFim < todayStr ? tx.dataFim : todayStr;
            let cur = new Date(tx.dataInicio + 'T00:00:00');
            while (dateStrFromDate(cur) <= end) {
              const curStr = dateStrFromDate(cur);
              if (curStr.startsWith(targetMonth)) total += v;
              addOneMonthClamped(cur);
            }
          }
        }
      }
      for (const card of cards) {
        const cardTxs = transactions.filter(t => t.tipo === 'cartao' && t.cartaoId === card.id);
        cardTxs.forEach(tx => {
          const txMonth = tx.dataInicio.slice(0, 7);
          if (txMonth === targetMonth) {
            if (tx.itens && tx.itens.length > 0) {
              tx.itens.forEach(item => {
                total += Number(item.valor) || 0;
              });
            } else {
              total += Number(tx.valor) || 0;
            }
          }
        });
      }
      return total;
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
      if (!tx.dataInicio?.startsWith(todayStr)) continue; // não vence hoje
      msgs.push(
        `🎉 *Última parcela!*\n${tx.descricao || 'Lançamento parcelado'} — a partir do próximo mês *${formatBRL(tx.valor)}* serão liberados no seu orçamento!`
      );
    }
  }

  // ── N15 — Saldo abaixo do mínimo configurado ─────────────────────────────────
  if (tipos.n15 !== false) {
    const saldoMinimo = Number(config.saldoMinimoAlerta ?? 200);
    if (saldoMinimo > 0) {
      const saldoAtual = calcSaldoSimples(transactions, todayStr);
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
    if (worst.pct > 100) {
      text += `🚨 A categoria *${label}* já estourou em *${formatBRL(worst.s - worst.budget)}* (${Math.round(worst.pct)}% do planejado).\n\n`;
      text += `👉 _Recomendação: Para compensar, tente reduzir saídas em outras categorias ou remanejar o saldo até o fim do mês._`;
    } else if (worst.pct >= 80) {
      text += `⚠️ Alerta: *${label}* consumiu *${Math.round(worst.pct)}%* do limite. Você tem apenas *${formatBRL(worst.budget - worst.s)}* para os próximos ${restDias} dias.\n\n`;
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
  const currentMonth = `${agora.getFullYear()}-${String(agora.getMonth()+1).padStart(2,'0')}`;
  
  const cardsSnap = await db.collection('cards').doc(uid).collection('list').get();
  const cards = cardsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (cards.length === 0) {
    return sendMessage(chatId, '💳 Nenhum cartão cadastrado.');
  }

  const txSnap = await db.collection('transactions').doc(uid).collection('entries').get();
  const txs    = txSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  let text = `🧾 *Detalhamento das Faturas (${agora.toLocaleString('pt-BR', { month: 'long', timeZone: 'America/Sao_Paulo' })})*\n\n`;

  for (const card of cards) {
    const cardTxs = txs.filter(t => t.tipo === 'cartao' && t.cartaoId === card.id);
    let faturaAtual = 0;
    const items = [];

    cardTxs.forEach(tx => {
      const txMonth = tx.dataInicio.slice(0, 7);
      if (txMonth === currentMonth) {
        if (tx.itens && tx.itens.length > 0) {
          tx.itens.forEach(item => {
            faturaAtual += Number(item.valor) || 0;
            items.push(item);
          });
        } else {
          faturaAtual += Number(tx.valor) || 0;
          items.push({ descricao: tx.descricao || 'Despesa Cartão', valor: tx.valor, dataCompra: tx.dataInicio });
        }
      }
    });

    text += `💳 *${card.nome}* (Limite: ${formatBRL(card.limite)})\n`;
    text += `Total Acumulado: *${formatBRL(faturaAtual)}*\n`;
    
    if (items.length > 0) {
      text += `_Lançamentos:_\n`;
      items.sort((a,b) => (a.dataCompra || '').localeCompare(b.dataCompra || '')).forEach(item => {
        const dia = item.dataCompra ? item.dataCompra.split('-')[2] : '–';
        text += ` • ${dia} · ${item.descricao || 'Despesa'}: *${formatBRL(item.valor)}*\n`;
      });
    } else {
      text += `_Nenhum lançamento no mês corrente._\n`;
    }
    text += `\n`;
  }

  return sendMessage(chatId, text.trim());
}

async function handleAjuda(chatId) {
  const MAIN_KEYBOARD = {
    keyboard: [
      [{ text: '💰 Saldo' }, { text: '💳 Cartões' }, { text: '🧾 Fatura' }],
      [{ text: '📊 Categorias' }, { text: '🎯 Metas' }, { text: '📈 Projeção' }],
      [{ text: '💡 Insight' }, { text: '❓ Ajuda' }]
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
    `/fatura — Detalhamento de faturas e compras do mês 🧾\n\n` +

    `*📈 Projeção*\n` +
    `/projecao — Saldo projetado nos próximos 7 dias\n\n` +

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
  if (cmd.includes('saldo')) cmd = '/saldo';
  else if (cmd.includes('cart') || cmd.includes('cartões')) cmd = '/cartoes';
  else if (cmd.includes('fatur')) cmd = '/fatura';
  else if (cmd.includes('proje') || cmd.includes('projeção')) cmd = '/projecao';
  else if (cmd.includes('categor')) cmd = '/categoria';
  else if (cmd.includes('meta')) cmd = '/meta';
  else if (cmd.includes('insig') || cmd.includes('dica') || cmd.includes('insight')) cmd = '/insight';
  else if (cmd.includes('ajuda') || cmd.includes('help')) cmd = '/ajuda';
  else if (cmd.includes('hoje')) cmd = '/hoje';
  else if (cmd.includes('hist')) cmd = '/historico';
  else if (cmd.includes('seman')) cmd = '/semana';
  else if (cmd.includes('mes')) cmd = '/mes';
  else if (cmd.includes('resum')) cmd = '/resumo';

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
    case '/insight':   return handleInsight(chatId, uid);
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
        if (horaUsuario !== horaAtual) continue;

        // Lê cartões
        const cardsSnap = await db.collection('cards').doc(uid).collection('list').get();
        const cards     = cardsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Lê transações
        const txSnap       = await db.collection('transactions').doc(uid).collection('entries').get();
        const transactions = txSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Lê metas/caixinhas (necessário para N16)
        const goalsSnap = await db.collection('goals').where('userId', '==', uid).get();
        const goals     = goalsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // ── Push: usa prefs.tipos (configurado em Notificações Push) ──────────
        if (pushEnabled) {
          const pushPrefs = { ...prefs, tipos: prefs.tipos || {} };
          const pushMsgs  = checkNotifications(cards, transactions, config, pushPrefs, goals);
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

        // ── Telegram: usa prefs.telegramTipos (configurado em Bot do Telegram) ─
        if (telegramEnabled) {
          // Fallback: se telegramTipos nunca foi configurado, usa prefs.tipos
          const tgTipos = prefs.telegramTipos !== undefined ? prefs.telegramTipos : (prefs.tipos || {});
          const tgPrefs = { ...prefs, tipos: tgTipos };
          const tgMsgs  = checkNotifications(cards, transactions, config, tgPrefs, goals);
          for (const msg of tgMsgs) {
            await sendMessage(chatId, msg);
            await new Promise(r => setTimeout(r, 100)); // evita rate limit
          }
          if (tgMsgs.length > 0)
            logger.info(`[TELEGRAM] uid=${uid}: ${tgMsgs.length} alerta(s) enviado(s)`);
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
  { command: 'saldo',     description: 'Saldo atual da conta' },
  { command: 'hoje',      description: 'Lancamentos registrados hoje' },
  { command: 'historico', description: 'Ultimos 10 lancamentos' },
  { command: 'semana',    description: 'Grafico de saidas dos ultimos 7 dias' },
  { command: 'mes',       description: 'Resumo do mes (ex: /mes 4 para abril)' },
  { command: 'resumo',    description: 'Entradas, saidas e saldo do mes corrente' },
  { command: 'categoria', description: 'Orcamento por categoria com barras de progresso' },
  { command: 'meta',      description: 'Status das metas da Divisao Percentual' },
  { command: 'insight',   description: 'Dicas e analises inteligentes de gastos' },
  { command: 'cartoes',   description: 'Cartoes cadastrados e vencimentos' },
  { command: 'fatura',    description: 'Itens e total acumulado na fatura atual' },
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
