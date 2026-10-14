'use strict';

const { expandRange } = require('../motor/caixa');
const { dateStrFromDate, getNowBrasilia } = require('../util/datas');
const { formatBRL } = require('../util/formato');

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

module.exports = { checkN18 };
