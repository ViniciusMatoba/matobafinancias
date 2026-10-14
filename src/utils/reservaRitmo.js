import { expandOccurrences } from './projectionCalc';
import { addMonths, todayStr } from './formatters';

/**
 * Projeção da reserva de emergência no ritmo REAL de aportes.
 *
 * Ritmo = mediana do que entrou na caixinha de reserva nos últimos 3 meses COMPLETOS (o mês atual fica de
 * fora, porque está pela metade). A mediana não se deixa levar por um aporte isolado muito grande. Meses antes
 * do primeiro movimento da caixinha não contam como zero; meses sem aporte DEPOIS dele contam.
 *
 * Movimentos da caixinha = lançamentos com `metaId` da reserva, no mesmo critério da tela Metas (saída
 * subtrai, o resto soma). Aqui entram TODAS as ocorrências do mês (um aporte mensal recorrente vale todo mês),
 * porque o ritmo descreve o que de fato entrou; o saldo da reserva segue a regra da tela Metas (recorrente uma vez).
 *
 * Há uma cópia fiel no bot (functions/lib/motor/reservaRitmo.js); a paridade é testada.
 */

export const RITMO_CFG = { tetoMeses: 120 }; // acima disso: "mais de 10 anos"

const MESES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const arred = (n) => Math.round(n * 100) / 100;
const ultimoDia = (mes) => {
  const [y, m] = mes.split('-').map(Number);
  return `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
};

/** 'YYYY-MM' -> 'mai/2027' */
export function rotuloMes(mes) {
  const [y, m] = mes.split('-').map(Number);
  return `${MESES_CURTO[m - 1]}/${y}`;
}

function mediana(valores) {
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export function ritmoDaReserva({ transactions, goalId, hoje = todayStr() }) {
  if (!goalId) return { ritmoMensal: 0, mesesBase: 0, mensal: [], motivo: 'sem-caixinha' };

  const mesAtual = hoje.slice(0, 7);
  const meses = [3, 2, 1].map(k => addMonths(`${mesAtual}-01`, -k).slice(0, 7)); // os 3 meses completos
  const from = `${meses[0]}-01`;
  const to = ultimoDia(meses[2]);

  const porMes = Object.fromEntries(meses.map(m => [m, 0]));
  const comMovimento = new Set();
  for (const t of (transactions || []).filter(x => x.metaId === goalId)) {
    const sinal = t.tipo === 'saida' ? -1 : 1;
    for (const o of expandOccurrences(t, from, to)) {
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

/** Quantos meses faltam no ritmo dado e em que mês a reserva fica completa. */
export function projecaoReserva({ falta, ritmoMensal, hoje = todayStr(), cfg = RITMO_CFG }) {
  if (!(falta > 0)) return { concluida: true };
  if (!(ritmoMensal > 0)) return { semRitmo: true };
  const meses = Math.ceil(falta / ritmoMensal);
  if (meses > cfg.tetoMeses) return { maisDeDezAnos: true, meses };
  return { meses, previsto: addMonths(`${hoje.slice(0, 7)}-01`, meses).slice(0, 7) };
}
