'use strict';

const { expandRange } = require('./caixa');

// ─── Helpers para Ações Rápidas do Bot e Webhook de Automação ─────────────────

// Itens de uma fatura projetada que vira lançamento real: sem projeção própria
// (o lançamento de origem segue projetando as parcelas seguintes — espelha itensDoLancamentoReal do app)
function itensDoLancamentoRealBot(itens) {
  return (itens || []).map(i => ({ ...i, isParcelado: false }));
}

// Valor e itens da ocorrência projetada de `occDate`: o documento de origem guarda a fatura original inteira,
// não o que cai naquele mês
function ocorrenciaProjetada(tx, occDate) {
  const occ = expandRange([tx], occDate, occDate).find(o => o.date === occDate);
  return { valor: occ ? occ.valor : tx.valor, itens: (occ && occ.tx && occ.tx.itens) || tx.itens || [] };
}

module.exports = { itensDoLancamentoRealBot, ocorrenciaProjetada };
