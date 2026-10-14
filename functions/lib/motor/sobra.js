'use strict';

const { calcSaldoSimples, expandRange } = require('./caixa');
const { addDaysFn, dateStrFromDate } = require('../util/datas');

// ─── Sobra segura (espelha calcularSobraSegura / resumirSobra do app) ─────────
const SOBRA_MINIMA_BOT = 200;

 // abaixo disto a sobra não é tratada como valor para investir

// Para cada dia: quanto dá para investir NAQUELE dia sem faltar dinheiro depois (menor saldo dali em diante)
function sobraPorDataBot(serie) {
  const out = new Array(serie.length);
  let min = Infinity;
  for (let i = serie.length - 1; i >= 0; i--) {
    min = Math.min(min, serie[i].saldo);
    out[i] = { date: serie[i].date, sobra: Math.max(0, Math.floor(min)) };
  }
  return out;
}

// hoje < mínimo: próxima janela = 1ª data com sobra >= mínimo; hoje >= mínimo: 1ª data com sobra >= hoje + mínimo
function resumirSobraBot(serie, minimo = SOBRA_MINIMA_BOT) {
  const porData = sobraPorDataBot(serie);
  const hoje = porData.length ? porData[0].sobra : 0;
  const alvo = hoje >= minimo ? hoje + minimo : minimo;
  const prox = porData.find((p, i) => i > 0 && p.sobra >= alvo);
  return {
    hoje,
    investivel: hoje >= minimo ? hoje : 0,
    proxima: prox ? { data: prox.date, valor: prox.sobra, aumento: prox.sobra - hoje } : null,
  };
}

function calcSobraSeguraBot(transactions, walletInitials, todayStr, hoje) {
  const proj45to = (() => { const d = new Date(hoje); d.setDate(d.getDate() + 45); return dateStrFromDate(d); })();
  // Saldo até ONTEM: o laço abaixo soma os lançamentos de hoje (antes somava duas vezes)
  const saldoBase = calcSaldoSimples(transactions, addDaysFn(todayStr, -1), walletInitials);
  const allOccs45 = expandRange(transactions, todayStr, proj45to);
  const byDate45 = {};
  for (const o of allOccs45) { if (!byDate45[o.date]) byDate45[o.date] = []; byDate45[o.date].push(o); }
  const serie = [];
  let cur = todayStr, sal = saldoBase;
  while (cur <= proj45to) {
    const items = byDate45[cur] || [];
    const ent = items.filter(i => i.tipo === 'entrada').reduce((s, i) => s + i.valor, 0);
    const sai = items.filter(i => i.tipo !== 'entrada').reduce((s, i) => s + i.valor, 0);
    sal = sal + ent - sai;
    serie.push({ date: cur, saldo: sal });
    const d = new Date(cur + 'T00:00:00'); d.setDate(d.getDate() + 1);
    cur = dateStrFromDate(d);
  }
  let minSaldo = serie[0].saldo, minDate = serie[0].date;
  for (const p of serie) if (p.saldo < minSaldo) { minSaldo = p.saldo; minDate = p.date; }
  const resumo = resumirSobraBot(serie);
  return { sobra: Math.max(Math.floor(minSaldo), 0), investivel: resumo.investivel, proxima: resumo.proxima, minSaldo, minDate };
}

module.exports = { SOBRA_MINIMA_BOT, sobraPorDataBot, resumirSobraBot, calcSobraSeguraBot };
