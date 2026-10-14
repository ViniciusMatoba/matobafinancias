'use strict';

const { expandRange } = require('./caixa');
const { addMonthsStr } = require('../util/datas');
const { formatBRL } = require('../util/formato');

// ─── Gasto por categoria no mês corrente ─────────────────────────────────────
const CATEGORY_ORDER = ['liberdade','custos_fixos','conforto','metas','prazeres','conhecimento'];

function isParcelaItemBot(item) {
  return !!item?.isParcelado || (Number(item?.totalParcelas) > 1 && Number(item?.parcelaAtual) >= 1);
}

/**
 * Eventos de despesa com data em [from, to], ordenados por data.
 * Evento: { date, valor, categoria, tag, descricao, tipo, tx, parcela, projetada, itemIndex? }
 */
function expandDespesasBot(transactions, from, to, { historical = false } = {}) {
  const eventos = [];
  const planos = new Map(); // parcela de um plano -> evento (real vence projetado; conta uma vez só)
  const normDesc = (s) => String(s || '').toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');

  const guardaPlano = (key, ev, real) => {
    const atual = planos.get(key);
    if (!atual || (real && !atual.real)) planos.set(key, { ev, real });
  };

  const faturaUnica = (tx) => {
    const venc = tx.dataInicio;
    const exclusoes = Array.isArray(tx.exclusoes) ? tx.exclusoes : [];
    const faturaExcluida = exclusoes.includes(venc);

    tx.itens.forEach((item, itemIndex) => {
      const valor = Number(item.valor) || 0;
      if (!valor) return;
      const comum = {
        valor,
        categoria: item.categoria || null,
        tag: item.tag || null,
        descricao: item.descricao || tx.descricao || 'Item de cartão',
        tipo: 'cartao',
        tx,
        itemIndex,
      };

      if (!isParcelaItemBot(item)) {
        if (faturaExcluida) return;
        const date = item.dataCompra || venc;
        if (date >= from && date <= to) eventos.push({ ...comum, date, parcela: null, projetada: false });
        return;
      }

      const total = Number(item.totalParcelas) || 1;
      const k = Math.max(1, Number(item.parcelaAtual) || 1);
      const origem = item.dataCompra || addMonthsStr(venc, -(k - 1));
      // Só itens marcados como parcelados projetam as seguintes (igual ao caixa); os convertidos contam só a do mês.
      const ultima = item.isParcelado ? total : k;

      for (let j = k; j <= ultima; j++) {
        const date = addMonthsStr(origem, j - 1);
        if (date > to) break;
        const dataCaixa = addMonthsStr(venc, j - k); // data em que o caixa projeta esta parcela
        const excluida = j === k ? faturaExcluida : (exclusoes.includes(dataCaixa) || !!(tx.dataFim && dataCaixa > tx.dataFim));
        if (excluida) continue;
        const chave = `${tx.cartaoId || ''}|${normDesc(item.descricao)}|${origem}|${total}|${j}`;
        guardaPlano(chave, { ...comum, date, parcela: `${j}/${total}`, projetada: j !== k }, j === k);
      }
    });
  };

  for (const tx of transactions || []) {
    if (!tx || tx.tipo === 'entrada') continue;

    const itens = tx.tipo === 'cartao' && Array.isArray(tx.itens) && tx.itens.length > 0 ? tx.itens : null;
    if (itens && tx.frequencia === 'unico') {
      faturaUnica(tx);
      continue;
    }

    // Demais despesas e faturas recorrentes: cada ocorrência vale na própria data
    for (const o of expandRange([tx], from, to, { historical })) {
      if (itens) {
        itens.forEach((item, itemIndex) => {
          const valor = Number(item.valor) || 0;
          if (!valor) return;
          eventos.push({
            date: o.date, valor, categoria: item.categoria || null, tag: item.tag || null,
            descricao: item.descricao || tx.descricao || 'Item de cartão',
            tipo: 'cartao', tx, parcela: null, projetada: false, itemIndex,
          });
        });
      } else {
        eventos.push({
          date: o.date,
          valor: o.valor,
          categoria: tx.categoria || (tx.tipo === 'investimento' ? 'liberdade' : null),
          tag: tx.tag || null,
          descricao: tx.descricao || tx.tipo,
          tipo: tx.tipo,
          tx,
          parcela: null,
          projetada: false,
        });
      }
    }
  }

  for (const { ev } of planos.values()) {
    if (ev.date >= from && ev.date <= to) eventos.push(ev);
  }

  return eventos.sort((a, b) => a.date.localeCompare(b.date) || b.valor - a.valor);
}

function computeSpentByCategory(transactions, currentMonth) {
  const totals = Object.fromEntries(CATEGORY_ORDER.map(id => [id, 0]));
  const [year, mon] = currentMonth.split('-').map(Number);
  const from = `${currentMonth}-01`;
  const to   = `${currentMonth}-${String(new Date(year, mon, 0).getDate()).padStart(2,'0')}`;

  // Por competência: igual à Home do app (à vista na data da compra, parcela mês a mês)
  for (const e of expandDespesasBot(transactions, from, to)) {
    if (e.categoria && e.categoria in totals) totals[e.categoria] += e.valor;
  }
  return totals;
}

// Retorna as duas maiores subcategorias (descrições) de gastos no mês para uma categoria
function getTopExpensesForCategory(transactions, category, currentMonth) {
  const [year, mon] = currentMonth.split('-').map(Number);
  const from = `${currentMonth}-01`;
  const to   = `${currentMonth}-${String(new Date(year, mon, 0).getDate()).padStart(2,'0')}`;

  const groups = {};
  for (const e of expandDespesasBot(transactions, from, to)) {
    if (e.categoria !== category) continue;
    const desc = String(e.descricao || '').trim() || e.tipo;
    groups[desc] = (groups[desc] || 0) + e.valor;
  }

  // Ordena por valor decrescente e pega os 2 principais
  const sorted = Object.entries(groups)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);

  if (sorted.length === 0) return '';
  return sorted.map(([desc, val]) => `${desc}: ${formatBRL(val)}`).join(', ');
}

// ─── /gastos — Despesas do mês por categoria, com filtro por categoria/termo ──
const GASTOS_CATS = {
  liberdade:     { icon: '💎', label: 'Liberdade' },
  custos_fixos:  { icon: '🏠', label: 'Custos Fixos' },
  conforto:      { icon: '🛋', label: 'Conforto' },
  metas:         { icon: '🎯', label: 'Metas' },
  prazeres:      { icon: '🎉', label: 'Prazeres' },
  conhecimento:  { icon: '📚', label: 'Conhecimento' },
  sem_categoria: { icon: '📦', label: 'Sem categoria' },
};

// Cada lançamento individual do mês, por competência (compra à vista na data da compra, parcela mês a mês)
function collectMonthExpenses(transactions, currentMonth, { historical = false } = {}) {
  const [year, mon] = currentMonth.split('-').map(Number);
  const from = `${currentMonth}-01`;
  const to   = `${currentMonth}-${String(new Date(year, mon, 0).getDate()).padStart(2, '0')}`;

  return expandDespesasBot(transactions, from, to, { historical }).map(e => {
    const desc = String(e.descricao || '').trim();
    return {
      date: e.date,
      desc: e.tipo === 'cartao'
        ? `${desc || 'Compra no cartão'}${e.parcela ? ` (${e.parcela})` : ''} 💳`
        : (desc || e.tipo),
      valor: e.valor,
      cat: e.categoria in GASTOS_CATS ? e.categoria : 'sem_categoria',
      tag: e.tag || null,
      tipo: e.tipo,
    };
  });
}

module.exports = { CATEGORY_ORDER, isParcelaItemBot, expandDespesasBot, computeSpentByCategory, getTopExpensesForCategory, GASTOS_CATS, collectMonthExpenses };
