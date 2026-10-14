'use strict';

// ─── Helpers de data (fuso Brasília UTC-3) ────────────────────────────────────
function getNowBrasilia() {
  // Usa formatToParts para extrair componentes de data em Brasília de forma confiável.
  // new Date().toLocaleString() é frágil no Node 22+ (U+202F antes de AM/PM quebra o parse).
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const p = Object.fromEntries(
    fmt.formatToParts(now)
      .filter(x => x.type !== 'literal')
      .map(x => [x.type, parseInt(x.value, 10)])
  );
  // Cria Date com valores de Brasília interpretados como UTC — getDate()/getMonth() retornam hora local BR
  return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second));
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

// ─── Despesas por competência (espelha src/utils/despesas.js do app) ─────────
// O gasto conta quando aconteceu: compra à vista na data da compra; parcela k na data da compra + (k-1) meses.
// Só leitura para categorias e relatórios — o caixa segue em expandRange/calcSaldoSimples, que não são alterados.
function addMonthsStr(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const ty = y + Math.floor((m - 1 + n) / 12);
  const tm = ((m - 1 + n) % 12 + 12) % 12; // 0-indexed
  const last = new Date(ty, tm + 1, 0).getDate();
  return `${ty}-${String(tm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

// Helper: adiciona dias a uma string de data
function addDaysFn(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}

function diffDaysStr(a, b) {
  return Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000);
}

module.exports = { getNowBrasilia, todayStrBrasilia, dateStrFromDate, addOneMonthClamped, addOneMonthClampedTo, addMonthsStr, addDaysFn, diffDaysStr };
