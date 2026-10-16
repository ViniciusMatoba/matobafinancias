'use strict';

const { checkN18 } = require('../alertas/economiaDia');
const { loadUserData } = require('../infra/dados');
const { db } = require('../infra/firebase');
const { sendMessage } = require('../infra/telegram');
const { calcSaldoSimples, expandRange } = require('../motor/caixa');
const { ehResgateBot } = require('../motor/investido');
const { CATEGORY_ORDER, computeSpentByCategory, getTopExpensesForCategory } = require('../motor/competencia');
const { addDaysFn, dateStrFromDate, getNowBrasilia, todayStrBrasilia } = require('../util/datas');
const { MESES_CURTO, MESES_LONGO, barra, formatBRL } = require('../util/formato');

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
    if (ehResgateBot(o.tx)) { /* resgate: não é receita nem gasto */ } else if (o.tipo === 'entrada') entradas += o.valor;
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

module.exports = { handleProjecao, handleInsight, handleProximas, handlePrevisao, handleEconomias, MESES_NOME_MAP, handleSaldoFinal };
