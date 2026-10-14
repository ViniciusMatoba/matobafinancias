'use strict';

const { addMonthsStr, addOneMonthClamped, addOneMonthClampedTo, dateStrFromDate, todayStrBrasilia } = require('../util/datas');

// ─── Ciclo de cartão (espelha getProximoVencimento do frontend) ──────────────
function getProximoVencimentoBot(card, today) {
  const [y, m, d] = today.split('-').map(Number);
  const diaFech = Number(card.diaFechamento) || Number(card.diaVencimento);
  const diaVenc = Number(card.diaVencimento);
  let mes = m, ano = y;
  if (d > diaFech) { mes += 1; if (mes > 12) { mes = 1; ano += 1; } }
  if (diaVenc < diaFech) { mes += 1; if (mes > 12) { mes = 1; ano += 1; } }
  const lastDay = new Date(ano, mes, 0).getDate();
  const dia = Math.min(diaVenc, lastDay);
  return `${ano}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
}

/**
 * Fatura do cartão EXATAMENTE como o app calcula (calcFaturaCard): por expansão de ocorrências na data
 * do vencimento, de mês em mês (/fatura e alerta N11). Conta as parcelas que uma fatura já paga ainda
 * projeta para os meses seguintes: o filtro de "conferido" vale por ocorrência, não pelo documento de origem.
 */
function calcFaturaCardApp(card, transactions, today) {
  const proximoVenc = getProximoVencimentoBot(card, today);
  const prevVenc = addMonthsStr(proximoVenc, -1);
  const cardTxs = transactions.filter(
    t => (t.tipo === 'cartao' && t.cartaoId === card.id) || t.cartaoVinculo === card.id
  );
  const ocorrenciasEm = (venc) => expandRange(cardTxs, venc, venc)
    .filter(o => o.date === venc && !o.tx.conferido);
  const pendentesVenc = (venc) => ocorrenciasEm(venc).reduce((acc, o) => acc + o.valor, 0);

  const prevPendente = pendentesVenc(prevVenc);
  const faturaVenc = (prevPendente > 0 && prevVenc <= today) ? prevVenc : proximoVenc;
  const faturaAtual = faturaVenc === prevVenc ? prevPendente : pendentesVenc(proximoVenc);

  let comprometidoFuturo = 0;
  for (let k = 1; k <= 24; k++) comprometidoFuturo += pendentesVenc(addMonthsStr(faturaVenc, k));

  const limite = card.limite || 0;
  const limiteDisponivel = Math.max(0, limite - faturaAtual - comprometidoFuturo);
  return {
    faturaAtual, comprometidoFuturo, limiteDisponivel, proximoVenc: faturaVenc,
    ocorrencias: ocorrenciasEm(faturaVenc),
  };
}

// ─── Expansão de transações em um intervalo [from, to] ───────────────────────
// Espelha o expandOccurrences do frontend para consistência nos cálculos.
// Retorna array de { date, valor, tipo }
const TYPE_SIGN = { entrada: +1, saida: -1, diario: -1, cartao: -1, investimento: -1 };

/**
 * Expande transações no intervalo [from, to].
 * @param {boolean} historical — quando true, inclui ocorrências passadas de tipo='diario'
 *   (estimativas diárias). Quando false (padrão), omite-as, espelhando o comportamento
 *   do frontend: gastos diários são provisões, não saídas reais confirmadas.
 */
function expandRange(transactions, from, to, { historical = false } = {}) {
  const today = todayStrBrasilia();
  const occs = [];
  for (const tx of transactions) {
    if (!tx.dataInicio || tx.dataInicio > to) continue;
    const v       = Number(tx.valor) || 0;
    if (!v) continue;
    const excl    = Array.isArray(tx.exclusoes) ? tx.exclusoes : [];
    // Espelha a regra do frontend: ocorrências passadas de tipo 'diario' só entram
    // em modo histórico — no cálculo de saldo normal são ignoradas.
    const push    = (ds) => {
      if (excl.includes(ds)) return;
      if (!historical && tx.tipo === 'diario' && ds < today) return;
      occs.push({ date: ds, valor: v, tipo: tx.tipo, tx });
    };

    if (tx.frequencia === 'unico') {
      if (tx.dataInicio >= from && tx.dataInicio <= to) push(tx.dataInicio);

      // Projeção de faturas futuras de itens de cartão (cartão de crédito)
      if (tx.tipo === 'cartao' && Array.isArray(tx.itens) && tx.itens.length > 0) {
        const parcelados = tx.itens.filter(i => i.isParcelado && (i.totalParcelas || 1) > (i.parcelaAtual || 1));
        if (parcelados.length > 0) {
          let maxMeses = 0;
          parcelados.forEach(i => {
            const remaining = (i.totalParcelas || 1) - (i.parcelaAtual || 1);
            if (remaining > maxMeses) maxMeses = remaining;
          });

          for (let m = 1; m <= maxMeses; m++) {
            const pd = new Date(tx.dataInicio + 'T00:00:00');
            for (let j = 0; j < m; j++) addOneMonthClamped(pd);
            const futureDate = dateStrFromDate(pd);

            if (futureDate > to) continue;
            if (excl.includes(futureDate)) continue;
            // "Esta e todas as futuras" grava dataFim no lançamento de origem para ele parar de projetar
            if (tx.dataFim && futureDate > tx.dataFim) continue;

            const futureItens = parcelados
              .filter(i => (i.parcelaAtual || 1) + m <= i.totalParcelas)
              .map(i => ({ ...i, parcelaAtual: (i.parcelaAtual || 1) + m }));

            if (futureItens.length > 0 && futureDate >= from) {
              const futureValor = futureItens.reduce((s, i) => s + (Number(i.valor) || 0), 0);
              const virtualTx = {
                ...tx,
                id: `${tx.id}-proj-${m}`,
                valor: futureValor,
                descricao: `${tx.descricao || 'Fatura'} (Parcelas restantes)`,
                itens: futureItens,
                conferido: false,
              };
              occs.push({ date: futureDate, valor: futureValor, tipo: tx.tipo, tx: virtualTx });
            }
          }
        }
      }

    } else if (tx.frequencia === 'parcelado') {
      const total = tx.totalParcelas || 1;
      const start = tx.parcelaAtual  || 1;
      for (let i = 0; i < total - start + 1; i++) {
        const pd = new Date(tx.dataInicio + 'T00:00:00');
        for (let j = 0; j < i; j++) addOneMonthClamped(pd);
        const ds = dateStrFromDate(pd);
        if (ds > to) break;
        if (ds >= from && (!tx.dataFim || ds <= tx.dataFim)) push(ds);
      }

    } else if (tx.frequencia === 'mensal') {
      const end     = tx.dataFim && tx.dataFim < to ? tx.dataFim : to;
      const origDay = new Date(tx.dataInicio + 'T00:00:00').getDate();
      let cur = new Date(tx.dataInicio + 'T00:00:00');
      while (dateStrFromDate(cur) <= end) {
        const ds = dateStrFromDate(cur);
        if (ds >= from) push(ds);
        addOneMonthClampedTo(cur, origDay); // preserva dia original (ex.: 31 → Mar 31)
      }

    } else if (tx.frequencia === 'semanal') {
      const end = tx.dataFim && tx.dataFim < to ? tx.dataFim : to;
      let cur = new Date(tx.dataInicio + 'T00:00:00');
      while (dateStrFromDate(cur) <= end) {
        const ds = dateStrFromDate(cur);
        if (ds >= from) push(ds);
        cur.setDate(cur.getDate() + 7);
      }

    } else if (tx.frequencia === 'diario') {
      // valor já é por dia (mensal / 30); gera uma ocorrência por dia
      const startStr = tx.dataInicio > from ? tx.dataInicio : from;
      const endStr   = tx.dataFim && tx.dataFim < to ? tx.dataFim : to;
      let cur = new Date(startStr + 'T00:00:00');
      const endDt = new Date(endStr + 'T00:00:00');
      while (cur <= endDt) {
        push(dateStrFromDate(cur));
        cur.setDate(cur.getDate() + 1);
      }
    }
  }
  return occs;
}

// ─── Cálculo de saldo acumulado até upTo ──────────────────────────────────────
// walletInitials: soma dos saldoInicial de todas as carteiras do usuário
function calcSaldoSimples(transactions, upTo, walletInitials = 0) {
  const FAR_PAST = '2020-01-01';
  // SEM historical:true — espelha HomeScreen que usa calcSaldo sem esse flag
  // historical:true incluía transações tipo 'diario' passadas que o app exclui, causando divergência
  const occs = expandRange(transactions, FAR_PAST, upTo);
  const txSaldo = occs.reduce((acc, o) => {
    const sign = TYPE_SIGN[o.tipo] ?? -1;
    return acc + sign * o.valor;
  }, 0);
  return txSaldo + walletInitials;
}

/**
 * Retorna o Set de cartaoIds que têm pelo menos uma fatura REAL (não projeção virtual)
 * no intervalo [from, to]. Usado para descartar projeções virtuais de meses anteriores
 * quando já existe lançamento real do mesmo cartão no período — evita dupla contagem.
 */
function cartaoComFaturaRealNoMes(transactions, from, to) {
  return new Set(
    transactions
      .filter(t => t.tipo === 'cartao' && t.dataInicio >= from && t.dataInicio <= to)
      .map(t => t.cartaoId)
  );
}

module.exports = { getProximoVencimentoBot, calcFaturaCardApp, TYPE_SIGN, expandRange, calcSaldoSimples, cartaoComFaturaRealNoMes };
