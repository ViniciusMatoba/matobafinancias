import { addDays, addWeeks, addMonths, TYPE_CONFIG, todayStr, getProximoVencimento } from './formatters';

/**
 * Retorna a data de fechamento real do ciclo que vence em `vencStr`.
 * Leva em conta que quando diaVencimento < diaFechamento, o fechamento
 * ocorre no mês anterior ao vencimento.
 */
export function getClosingDate(card, vencStr) {
  const [y, m] = vencStr.split('-').map(Number);
  const diaFech = card.diaFechamento || card.diaVencimento;
  const diaVenc = card.diaVencimento;
  let cm = m, cy = y;
  if (diaVenc < diaFech) { cm -= 1; if (cm < 1) { cm = 12; cy -= 1; } }
  const lastDay = new Date(cy, cm, 0).getDate();
  const dia = Math.min(diaFech, lastDay);
  return `${cy}-${String(cm).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/**
 * Expande uma transação (regra) em ocorrências dentro do intervalo [from, to].
 * Retorna array de { date, valor, sinal, tx }
 */
export function expandOccurrences(tx, from, to, { historical = false } = {}) {
  const sign = TYPE_CONFIG[tx.tipo]?.sign ?? -1;
  const occurrences = [];

  const today = todayStr();

  if (tx.frequencia === 'unico') {
    if (tx.dataInicio >= from && tx.dataInicio <= to) {
      if (historical || !(tx.tipo === 'diario' && tx.dataInicio < today)) {
        if (!tx.exclusoes?.includes(tx.dataInicio)) {
          occurrences.push({ date: tx.dataInicio, valor: tx.valor, sinal: sign, tx });
        }
      }
    }

    // Projeção de parcelas futuras de itens do cartão
    if (tx.tipo === 'cartao' && tx.itens && tx.itens.length > 0) {
      const parcelados = tx.itens.filter(i => i.isParcelado && i.totalParcelas > (i.parcelaAtual || 1));
      if (parcelados.length > 0) {
        let maxMeses = 0;
        parcelados.forEach(i => {
          const remaining = i.totalParcelas - (i.parcelaAtual || 1);
          if (remaining > maxMeses) maxMeses = remaining;
        });

        for (let m = 1; m <= maxMeses; m++) {
          const futureDate = addMonths(tx.dataInicio, m);
          if (futureDate > to) continue;
          if (tx.exclusoes?.includes(futureDate)) continue;

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
            occurrences.push({ date: futureDate, valor: futureValor, sinal: sign, tx: virtualTx });
          }
        }
      }
    }

    return occurrences;
  }

  if (tx.frequencia === 'parcelado') {
    const startParcela = tx.parcelaAtual || 1;
    const remaining = Math.max(0, (tx.totalParcelas || 1) - startParcela + 1);
    for (let i = 0; i < remaining; i++) {
      const date = addMonths(tx.dataInicio, i);
      if (date > to || (tx.dataFim && date > tx.dataFim)) break;
      if (date >= from) {
        if (!tx.exclusoes?.includes(date)) {
          occurrences.push({ date, valor: tx.valor, sinal: sign, tx, parcela: startParcela + i, totalParcelas: tx.totalParcelas });
        }
      }
    }
    return occurrences;
  }

  // Para frequência mensal, preserva o dia original para não perder o "dia 31"
  // quando passar por meses mais curtos (e.g. Jan 31 → Fev 28 → Mar 31, não Mar 28).
  const originDay = tx.frequencia === 'mensal' ? parseInt(tx.dataInicio.slice(8, 10), 10) : null;

  let current = tx.dataInicio;
  let monthOffset = 0;
  const limit = tx.dataFim || to;

  while (current <= to && current <= limit) {
    if (current >= from) {
      if (historical || !(tx.tipo === 'diario' && current < today)) {
        if (!tx.exclusoes?.includes(current)) {
          occurrences.push({ date: current, valor: tx.valor, sinal: sign, tx });
        }
      }
    }
    if (tx.frequencia === 'diario') {
      current = addDays(current, 1);
    } else if (tx.frequencia === 'semanal') {
      current = addWeeks(current, 1);
    } else if (tx.frequencia === 'mensal') {
      // Avança sempre a partir da data de início com o dia original preservado,
      // aplicando clamp ao último dia do mês destino.
      monthOffset += 1;
      const [y, m] = tx.dataInicio.split('-').map(Number);
      const targetYear  = y + Math.floor((m - 1 + monthOffset) / 12);
      const targetMonth = ((m - 1 + monthOffset) % 12 + 12) % 12; // 0-indexed
      const lastDay     = new Date(targetYear, targetMonth + 1, 0).getDate();
      const day         = Math.min(originDay, lastDay);
      current = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    } else {
      break;
    }
  }

  return occurrences;
}

/**
 * Retorna array de { date, saldo, entradas, saidas, items[] } para cada dia do intervalo.
 * saldoInicial: saldo atual do usuário.
 */
export function buildDailyProjection(transactions, from, to, saldoInicial = 0) {
  const allOccurrences = transactions.flatMap(tx => expandOccurrences(tx, from, to));

  const byDate = {};
  for (const occ of allOccurrences) {
    if (!byDate[occ.date]) byDate[occ.date] = [];
    byDate[occ.date].push(occ);
  }

  const days = [];
  let current = from;
  let saldo = saldoInicial;

  while (current <= to) {
    const items = byDate[current] || [];
    const entradas = items.filter(i => i.sinal > 0).reduce((s, i) => s + i.valor, 0);
    const saidas   = items.filter(i => i.sinal < 0).reduce((s, i) => s + i.valor, 0);
    saldo = saldo + entradas - saidas;
    days.push({ date: current, saldo, entradas, saidas, items });
    current = addDays(current, 1);
  }

  return days;
}

/**
 * Calcula saldo a partir das transações do mês/período.
 */
export function calcSaldo(transactions, from, to, { historical = false } = {}) {
  const occs = transactions.flatMap(tx => expandOccurrences(tx, from, to, { historical }));
  return occs.reduce((acc, o) => acc + o.sinal * o.valor, 0);
}

/**
 * Calcula a sobra segura (Leftover Balance) projetando o saldo futuro.
 * Retorna { sobra, dataVerificada }
 */
export function calcularSobraSegura(transactions, wallets, days = 45) {
  const from = todayStr();
  const to = addDays(from, days);
  
  const wInitials = wallets?.reduce((acc, w) => acc + (w.saldoInicial || 0), 0) || 0;
  const saldoAtual = calcSaldo(transactions, '2020-01-01', addDays(from, -1), { historical: true }) + wInitials;

  const dailyProj = buildDailyProjection(transactions, from, to, saldoAtual);
  
  let minSaldo = saldoAtual;
  for (const day of dailyProj) {
    if (day.saldo < minSaldo) minSaldo = day.saldo;
  }

  return {
    sobra: minSaldo > 0 ? minSaldo : 0,
    dataVerificada: to
  };
}

/**
 * Calcula fatura atual e comprometido futuro de um cartão.
 *
 * Regras:
 *  1. dataInicio dos lançamentos de cartão é sempre a DATA DE VENCIMENTO da fatura
 *     a que pertencem (o formulário preenche automaticamente com o próximo vencimento,
 *     já considerando a data de fechamento). Por isso o filtro usa limites de vencimento,
 *     NÃO de fechamento.
 *
 *  2. Itens parcelados: tx.valor contém apenas a parcela do mês corrente.
 *     As parcelas futuras (m+1 … totalParcelas) são projeções virtuais que não existem
 *     no Firestore — precisam ser somadas manualmente ao comprometidoFuturo para que o
 *     limite disponível reflita o comprometimento real do cartão.
 *
 * @param {{ diaFechamento?: number, diaVencimento: number, limite?: number }} card
 * @param {Array} transactions - todas as transações do usuário
 * @param {string} today - 'YYYY-MM-DD'
 * @returns {{ faturaAtual: number, comprometidoFuturo: number, limiteDisponivel: number, proximoVenc: string }}
 */
export function calcFaturaCard(card, transactions, today) {
  const proximoVenc = getProximoVencimento(card, today);
  // Ciclo atual: (vencimento anterior, próximo vencimento]
  const prevVenc = addMonths(proximoVenc, -1);

  const cardTxs = transactions.filter(
    t => t.tipo === 'cartao' && t.cartaoId === card.id && !t.conferido
  );

  let faturaAtual        = 0;
  let comprometidoFuturo = 0;

  cardTxs.forEach(tx => {
    const val = Number(tx.valor) || 0;
    const d   = tx.dataInicio;

    // 1. Classifica o lançamento base pelo seu vencimento
    if (d > prevVenc && d <= proximoVenc) {
      faturaAtual += val;
    } else if (d > proximoVenc) {
      comprometidoFuturo += val;
    }

    // 2. Acumula parcelas futuras de itens parcelados desta fatura
    //    (não existem como documentos no Firestore, são projeções virtuais)
    if (tx.itens?.length > 0) {
      tx.itens.forEach(item => {
        if (!item.isParcelado) return;
        const itemVal  = Number(item.valor) || 0;
        const parAtual = item.parcelaAtual || 1;
        const parTotal = item.totalParcelas || 1;
        const remaining = parTotal - parAtual; // quantidade de parcelas ainda por vir
        if (remaining <= 0) return;

        // Cada parcela futura é cobrada em addMonths(d, m), que sempre será
        // > proximoVenc (pois d ≤ proximoVenc e m ≥ 1), portanto vai a comprometidoFuturo
        comprometidoFuturo += remaining * itemVal;
      });
    }
  });

  const limite = card.limite || 0;
  const limiteDisponivel = Math.max(0, limite - faturaAtual - comprometidoFuturo);

  return { faturaAtual, comprometidoFuturo, limiteDisponivel, proximoVenc };
}
