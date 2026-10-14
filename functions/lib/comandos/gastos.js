'use strict';

const { loadTags, loadUserData } = require('../infra/dados');
const { APP_URL, sendMessage } = require('../infra/telegram');
const { GASTOS_CATS, collectMonthExpenses } = require('../motor/competencia');
const { getNowBrasilia } = require('../util/datas');
const { MESES_CURTO, MESES_LONGO, barra, formatBRL, mdEscape, normTxt } = require('../util/formato');

// Envia blocos de texto respeitando o limite de 4096 caracteres do Telegram
async function sendChunked(chatId, header, lines) {
  const LIMIT = 3500;
  let buf = header;
  for (const line of lines) {
    if (buf.length + line.length + 1 > LIMIT) {
      await sendMessage(chatId, buf.trim());
      buf = '';
    }
    buf += line + '\n';
  }
  if (buf.trim()) await sendMessage(chatId, buf.trim());
}

// Nomes/abreviações de mês (sem acento) → número 1–12
const MES_TOKENS = (() => {
  const map = {};
  MESES_LONGO.forEach((nome, i) => {
    if (!i) return;
    const n = normTxt(nome);
    map[n] = i;
    map[n.slice(0, 3)] = i;
  });
  return map;
})();

// Separa o argumento em: mês/ano alvo, modo "top" e termo restante (categoria/busca)
function parseGastosArgs(args, agora) {
  let month = null, year = null, top = false;
  const resto = [];
  for (const tk of normTxt(args).split(/\s+/).filter(Boolean)) {
    if (MES_TOKENS[tk] && month === null) month = MES_TOKENS[tk];
    else if (/^(19|20)\d{2}$/.test(tk)) year = Number(tk);
    else if (['top', 'maiores', 'maior', 'ranking'].includes(tk)) top = true;
    else resto.push(tk);
  }
  const curY = agora.getFullYear(), curM = agora.getMonth() + 1;
  if (month === null) month = curM;
  if (year === null) year = month > curM ? curY - 1 : curY;
  return { month, year, top, termo: resto.join(' ') };
}

async function handleGastos(chatId, uid, args) {
  const agora = getNowBrasilia();
  const { month, year, top: topMode, termo } = parseGastosArgs(args, agora);
  const currentMonth = `${year}-${String(month).padStart(2, '0')}`;
  const nomeMes = `${MESES_LONGO[month]}${year !== agora.getFullYear() ? ` ${year}` : ''}`;
  const [{ transactions }, tags] = await Promise.all([loadUserData(uid), loadTags(uid)]);
  const tagById = Object.fromEntries(tags.map(t => [t.id, t]));
  const entries = collectMonthExpenses(transactions, currentMonth)
    .map(e => ({ ...e, tagLabel: tagById[e.tag]?.label || null }));

  if (entries.length === 0) {
    return sendMessage(chatId, `📭 Nenhuma despesa lançada em ${nomeMes}.`);
  }

  const fmtDate = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  const linha = (e, comTag = true) => `• ${fmtDate(e.date)} — ${mdEscape(e.desc)}: *${formatBRL(e.valor)}*${comTag && e.tagLabel ? ` _🏷 ${mdEscape(e.tagLabel)}_` : ''}`;
  const byDate = (a, b) => a.date.localeCompare(b.date);
  const ordenar = (list) => topMode
    ? [...list].sort((a, b) => b.valor - a.valor).slice(0, 10)
    : [...list].sort(byDate);
  const tituloTop = topMode ? '🏆 Maiores gastos' : null;

  // ── Sem argumento: visão geral, todas as categorias com seus lançamentos ──
  if (!termo && topMode) {
    const list = ordenar(entries);
    return sendChunked(chatId,
      `🏆 *Maiores gastos — ${nomeMes}*\n`,
      list.map((e, i) => `${i + 1}. ${linha(e)} _(${GASTOS_CATS[e.cat].label})_`));
  }

  if (!termo) {
    const groups = {};
    for (const e of entries) (groups[e.cat] = groups[e.cat] || []).push(e);
    const total = entries.reduce((s, e) => s + e.valor, 0);
    const ordem = Object.keys(groups).sort(
      (a, b) => groups[b].reduce((s, e) => s + e.valor, 0) - groups[a].reduce((s, e) => s + e.valor, 0)
    );

    const lines = [];
    for (const cat of ordem) {
      const list = groups[cat].sort(byDate);
      const sub = list.reduce((s, e) => s + e.valor, 0);
      const pct = Math.round((sub / total) * 100);
      lines.push(`\n${GASTOS_CATS[cat].icon} *${GASTOS_CATS[cat].label}* — ${formatBRL(sub)} (${pct}%)`);
      list.forEach(e => lines.push(linha(e)));
    }
    lines.push(`\n_Para ver só uma categoria: /gastos conforto — ou uma tag: /gastos mercado — ou o total por tag: /tags_`);
    return sendChunked(chatId,
      `🧾 *Gastos de ${nomeMes}*\nTotal: *${formatBRL(total)}* em ${entries.length} lançamento${entries.length > 1 ? 's' : ''}\n`,
      lines);
  }

  // ── Argumento é uma tag: nome exato vence; prefixo só se não for categoria ─
  const exibirTag = (tag) => {
    const all = entries.filter(e => e.tag === tag.id);
    if (all.length === 0) {
      return sendMessage(chatId, `🏷 Nenhuma despesa com a tag *${mdEscape(tag.label)}* em ${nomeMes}.`);
    }
    const sub = all.reduce((s, e) => s + e.valor, 0);
    return sendChunked(chatId,
      `🏷 *${mdEscape(tag.label)} — ${nomeMes}*${tituloTop ? ' (maiores)' : ''}\nTotal: *${formatBRL(sub)}* em ${all.length} lançamento${all.length > 1 ? 's' : ''}\n`,
      ordenar(all).map(e => `${linha(e, false)} _(${GASTOS_CATS[e.cat].label})_`));
  };
  const tagExata = tags.find(t => normTxt(t.label) === termo);
  if (tagExata) return exibirTag(tagExata);

  // ── Argumento é uma categoria: todos os lançamentos dela ──────────────────
  const catMatch = Object.keys(GASTOS_CATS).find(id => {
    const label = normTxt(GASTOS_CATS[id].label);
    const idTxt = id.replace(/_/g, ' ');
    return termo.length >= 3 && (label === termo || idTxt === termo || label.startsWith(termo) || idTxt.startsWith(termo));
  });

  if (!catMatch && termo.length >= 3) {
    const tagPrefixo = tags.find(t => normTxt(t.label).startsWith(termo));
    if (tagPrefixo) return exibirTag(tagPrefixo);
  }

  if (catMatch) {
    const all = entries.filter(e => e.cat === catMatch);
    if (all.length === 0) {
      return sendMessage(chatId, `${GASTOS_CATS[catMatch].icon} Nenhuma despesa em *${GASTOS_CATS[catMatch].label}* em ${nomeMes}.`);
    }
    const sub = all.reduce((s, e) => s + e.valor, 0);
    return sendChunked(chatId,
      `${GASTOS_CATS[catMatch].icon} *${GASTOS_CATS[catMatch].label} — ${nomeMes}*${tituloTop ? ' (maiores)' : ''}\nTotal: *${formatBRL(sub)}* em ${all.length} lançamento${all.length > 1 ? 's' : ''}\n`,
      ordenar(all).map(e => linha(e)));
  }

  // ── Argumento é um termo livre: busca na descrição, na categoria e na tag ─
  const found = entries
    .filter(e => normTxt(e.desc).includes(termo)
      || normTxt(GASTOS_CATS[e.cat].label).includes(termo)
      || normTxt(e.tagLabel).includes(termo));
  if (found.length === 0) {
    return sendMessage(chatId, `🔎 Nada encontrado para "${mdEscape(termo)}" em ${nomeMes}.\n\nUse /gastos para ver todas as despesas do mês.`);
  }
  const sub = found.reduce((s, e) => s + e.valor, 0);
  return sendChunked(chatId,
    `🔎 *"${mdEscape(termo)}" — ${nomeMes}*${tituloTop ? ' (maiores)' : ''}\nTotal: *${formatBRL(sub)}* em ${found.length} lançamento${found.length > 1 ? 's' : ''}\n`,
    ordenar(found).map(e => `${linha(e)} _(${GASTOS_CATS[e.cat].label})_`));
}

// ─── /tags — Total gasto por tag no mês ───────────────────────────────────────
async function handleTags(chatId, uid, args) {
  const agora = getNowBrasilia();
  const { month, year } = parseGastosArgs(args, agora);
  const currentMonth = `${year}-${String(month).padStart(2, '0')}`;
  const nomeMes = `${MESES_LONGO[month]}${year !== agora.getFullYear() ? ` ${year}` : ''}`;
  const [{ transactions }, tags] = await Promise.all([loadUserData(uid), loadTags(uid)]);

  if (tags.length === 0) {
    return sendMessage(chatId,
      `🏷 *Tags*\n\nVocê ainda não criou tags. Crie no app em *Configurações → Tags* ` +
      `(ou direto ao lançar uma despesa) para ver aqui quanto vai em Mercado, Streaming, Transporte…\n\n👉 ${APP_URL}`);
  }

  // Investimento não recebe tag, então fica fora desta conta
  const entries = collectMonthExpenses(transactions, currentMonth).filter(e => e.tipo !== 'investimento');
  if (entries.length === 0) {
    return sendMessage(chatId, `📭 Nenhuma despesa lançada em ${nomeMes}.`);
  }

  const tagById = Object.fromEntries(tags.map(t => [t.id, t]));
  const grupos = new Map();
  for (const e of entries) {
    const key = tagById[e.tag] ? e.tag : '__sem';
    const g = grupos.get(key) || { valor: 0, count: 0 };
    g.valor += e.valor;
    g.count += 1;
    grupos.set(key, g);
  }

  const total = entries.reduce((s, e) => s + e.valor, 0);
  const comTag = [...grupos.entries()].filter(([k]) => k !== '__sem').sort((a, b) => b[1].valor - a[1].valor);
  const sem = grupos.get('__sem');
  const fmtLinha = (nome, g) => {
    const { bar, pct } = barra(g.valor, total, 10);
    return `\`[${bar}]\` *${nome}* — ${formatBRL(g.valor)} (${pct}%) · ${g.count} lanç.`;
  };

  // Limite mensal da tag (opcional): uma linha logo abaixo da tag que tem limite
  const linhaLimite = (tag, gasto) => {
    const limite = Number(tag?.limite);
    if (!(limite > 0)) return '';
    const pct = (gasto / limite) * 100;
    const icone = pct > 100 ? '🚨' : pct >= 80 ? '⚠️' : '✅';
    const resto = pct > 100 ? `passou ${formatBRL(gasto - limite)}` : `restam ${formatBRL(limite - gasto)}`;
    return `\n   ${icone} limite ${formatBRL(limite)}: *${Math.round(pct)}%* (${resto})`;
  };

  const lines = comTag.map(([id, g]) => fmtLinha(`🏷 ${mdEscape(tagById[id].label)}`, g) + linhaLimite(tagById[id], g.valor));
  // tags com limite e sem nenhum gasto no mês também aparecem (para o limite não "sumir")
  const comGasto = new Set(comTag.map(([id]) => id));
  for (const t of tags) {
    if (!comGasto.has(t.id) && Number(t.limite) > 0) lines.push(`🏷 *${mdEscape(t.label)}* — sem gasto${linhaLimite(t, 0)}`);
  }
  if (sem) lines.push(fmtLinha('Sem tag', sem));
  lines.push(`\n_Detalhe de uma tag: /gastos ${normTxt(tagById[comTag[0]?.[0]]?.label || 'mercado')} — outro mês: /tags agosto_`);
  if (sem && sem.valor / total >= 0.2) {
    lines.push(`_Dica: classifique o que falta no app em Configurações → Tags → Classificar lançamentos antigos._`);
  }
  return sendChunked(chatId,
    `🏷 *Gastos por tag — ${nomeMes}*\nTotal: *${formatBRL(total)}* em ${entries.length} lançamento${entries.length > 1 ? 's' : ''}\n\n`,
    lines);
}

// ─── /meses — Total gasto por mês (últimos N meses) e mês mais alto ──────────
async function handleMeses(chatId, uid, args) {
  const agora = getNowBrasilia();
  const n = Math.min(Math.max(parseInt(args, 10) || 12, 3), 24);
  const { transactions } = await loadUserData(uid);

  const meses = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const total = collectMonthExpenses(transactions, key).reduce((s, e) => s + e.valor, 0);
    meses.push({ key, mes: d.getMonth() + 1, ano: d.getFullYear(), total, atual: i === 0 });
  }
  const inicio = meses.findIndex(m => m.total > 0);
  if (inicio === -1) return sendMessage(chatId, '📭 Nenhuma despesa lançada nesse período.');
  const lista = meses.slice(inicio);

  const max = Math.max(...lista.map(m => m.total));
  const fechados = lista.filter(m => !m.atual);
  const maisAlto = [...(fechados.length ? fechados : lista)].sort((a, b) => b.total - a.total)[0];
  const maisBaixo = [...(fechados.length ? fechados : lista)].sort((a, b) => a.total - b.total)[0];
  const media = fechados.length ? fechados.reduce((s, m) => s + m.total, 0) / fechados.length : 0;
  const rotulo = (m) => `${MESES_CURTO[m.mes]}/${String(m.ano).slice(2)}`;

  let msg = `📅 *Gastos por mês — últimos ${lista.length} meses*\n\n`;
  for (const m of lista) {
    const { bar } = barra(m.total, max, 10);
    const marca = m === maisAlto ? ' 🔺' : m === maisBaixo && lista.length > 2 ? ' 🔻' : '';
    msg += `\`${rotulo(m)} ${bar}\` ${formatBRL(m.total)}${m.atual ? ' _(em andamento)_' : ''}${marca}\n`;
  }
  msg += `\n🔺 Mês mais alto: *${MESES_LONGO[maisAlto.mes]}/${maisAlto.ano}* — ${formatBRL(maisAlto.total)}`;
  if (lista.length > 2) msg += `\n🔻 Mês mais baixo: *${MESES_LONGO[maisBaixo.mes]}/${maisBaixo.ano}* — ${formatBRL(maisBaixo.total)}`;
  if (fechados.length > 1) msg += `\n📊 Média dos meses fechados: *${formatBRL(media)}*`;
  msg += `\n\n_Detalhe de um mês: /gastos agosto — maiores: /gastos top_`;
  return sendMessage(chatId, msg.trim());
}

module.exports = { sendChunked, MES_TOKENS, parseGastosArgs, handleGastos, handleTags, handleMeses };
