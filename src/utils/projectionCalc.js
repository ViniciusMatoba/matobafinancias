import { addDays, addWeeks, addMonths, TYPE_CONFIG, todayStr } from './formatters';

/**
 * Expande uma transação (regra) em ocorrências dentro do intervalo [from, to].
 * Retorna array de { date, valor, sinal, tx }
 */
export function expandOccurrences(tx, from, to) {
  const sign = TYPE_CONFIG[tx.tipo]?.sign ?? -1;
  const occurrences = [];

  const today = todayStr();

  if (tx.frequencia === 'unico') {
    if (tx.dataInicio >= from && tx.dataInicio <= to) {
      if (!(tx.tipo === 'diario' && tx.dataInicio < today)) {
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

  let current = tx.dataInicio;
  const limit = tx.dataFim || to;

  while (current <= to && current <= limit) {
    if (current >= from) {
      if (!(tx.tipo === 'diario' && current < today)) {
        if (!tx.exclusoes?.includes(current)) {
          occurrences.push({ date: current, valor: tx.valor, sinal: sign, tx });
        }
      }
    }
    if (tx.frequencia === 'diario')   current = addDays(current, 1);
    else if (tx.frequencia === 'semanal')  current = addWeeks(current, 1);
    else if (tx.frequencia === 'mensal')   current = addMonths(current, 1);
    else break;
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
export function calcSaldo(transactions, from, to) {
  const occs = transactions.flatMap(tx => expandOccurrences(tx, from, to));
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
  const saldoAtual = calcSaldo(transactions, '2020-01-01', addDays(from, -1)) + wInitials;

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
