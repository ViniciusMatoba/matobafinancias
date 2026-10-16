'use strict';

const { expandRange } = require('./caixa');
const { addMonthsStr, todayStrBrasilia } = require('../util/datas');
const { sinalNaCaixinhaBot } = require('./investido');

/**
 * Projeção da reserva no ritmo real de aportes — cópia fiel de src/utils/reservaRitmo.js do app
 * (a paridade é testada). Regras: ver o arquivo do app.
 */

const RITMO_CFG = { tetoMeses: 120 };

const MESES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const arred = (n) => Math.round(n * 100) / 100;
const ultimoDia = (mes) => {
  const [y, m] = mes.split('-').map(Number);
  return `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
};

function rotuloMes(mes) {
  const [y, m] = mes.split('-').map(Number);
  return `${MESES_CURTO[m - 1]}/${y}`;
}

function mediana(valores) {
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

function ritmoDaReservaBot({ transactions, goalId, hoje = todayStrBrasilia() }) {
  if (!goalId) return { ritmoMensal: 0, mesesBase: 0, mensal: [], motivo: 'sem-caixinha' };

  const mesAtual = hoje.slice(0, 7);
  const meses = [3, 2, 1].map(k => addMonthsStr(`${mesAtual}-01`, -k).slice(0, 7));
  const from = `${meses[0]}-01`;
  const to = ultimoDia(meses[2]);

  const porMes = Object.fromEntries(meses.map(m => [m, 0]));
  const comMovimento = new Set();
  for (const t of (transactions || []).filter(x => x.metaId === goalId)) {
    const sinal = sinalNaCaixinhaBot(t);
    for (const o of expandRange([t], from, to)) {
      const m = o.date.slice(0, 7);
      if (m in porMes) { porMes[m] += sinal * o.valor; comMovimento.add(m); }
    }
  }

  const primeiro = meses.findIndex(m => comMovimento.has(m));
  if (primeiro < 0) return { ritmoMensal: 0, mesesBase: 0, mensal: [], motivo: 'sem-aportes' };

  const base = meses.slice(primeiro).map(m => ({ mes: m, valor: arred(porMes[m]) }));
  const ritmo = mediana(base.map(b => b.valor));
  return {
    ritmoMensal: ritmo > 0 ? arred(ritmo) : 0,
    mesesBase: base.length,
    mensal: base,
    motivo: ritmo > 0 ? null : 'sem-aportes',
  };
}

function projecaoReservaBot({ falta, ritmoMensal, hoje = todayStrBrasilia(), cfg = RITMO_CFG }) {
  if (!(falta > 0)) return { concluida: true };
  if (!(ritmoMensal > 0)) return { semRitmo: true };
  const meses = Math.ceil(falta / ritmoMensal);
  if (meses > cfg.tetoMeses) return { maisDeDezAnos: true, meses };
  return { meses, previsto: addMonthsStr(`${hoje.slice(0, 7)}-01`, meses).slice(0, 7) };
}

/**
 * Texto de uma linha para o Telegram (usado em /reserva e no relatório N23).
 * `ritmo` vem de ritmoDaReservaBot e `proj` de projecaoReservaBot. Devolve '' quando não há o que dizer.
 */
function linhaProjecaoReserva(ritmo, proj, formatBRL) {
  if (proj.concluida) return '';
  if (proj.semRitmo) return '⏱ _Sem aportes na reserva nos últimos meses — ainda não dá para projetar quando ela completa._';
  const base = ritmo.mesesBase === 1 ? ', só 1 mês de histórico' : '';
  const prazo = proj.maisDeDezAnos
    ? 'mais de 10 anos'
    : `${proj.meses} ${proj.meses === 1 ? 'mês' : 'meses'} (${rotuloMes(proj.previsto)})`;
  return `⏱ _No seu ritmo (${formatBRL(ritmo.ritmoMensal)}/mês${base}) a reserva completa em ${prazo}._`;
}

module.exports = { RITMO_CFG, rotuloMes, ritmoDaReservaBot, projecaoReservaBot, linhaProjecaoReserva };
