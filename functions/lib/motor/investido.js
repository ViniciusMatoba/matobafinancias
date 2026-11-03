'use strict';

const { expandRange } = require('./caixa');

/**
 * Resgate = dinheiro que volta do investimento para a conta: ENTRADA com `resgate: true` (e `metaId` quando sai
 * de uma caixinha). Espelha src/utils/investido.js (a paridade é testada).
 */
const ehResgateBot = (tx) => !!tx && tx.tipo === 'entrada' && tx.resgate === true;

/** Ajuste de valor do investido (rendimento): investimento com `ajuste: true` e `valor` com sinal. Espelha src/utils/investido.js. */
const ehAjusteBot = (tx) => !!tx && tx.tipo === 'investimento' && tx.ajuste === true;

/** Sinal de um lançamento ligado a uma caixinha: saída e resgate tiram, o resto soma. */
const sinalNaCaixinhaBot = (tx) => (tx.tipo === 'saida' || ehResgateBot(tx) ? -1 : 1);

/** Total investido até a data (inclusive): aportes − resgates. */
function totalInvestidoAteBot(transactions, ate) {
  let total = 0;
  for (const t of transactions || []) {
    if (ehAjusteBot(t)) { if (t.dataInicio && t.dataInicio <= ate) total += Number(t.valor) || 0; continue; }
    const sinal = t.tipo === 'investimento' ? 1 : ehResgateBot(t) ? -1 : 0;
    if (!sinal) continue;
    for (const o of expandRange([t], '2020-01-01', ate)) total += sinal * (Number(o.valor) || 0);
  }
  return total;
}

module.exports = { ehAjusteBot, ehResgateBot, sinalNaCaixinhaBot, totalInvestidoAteBot };
