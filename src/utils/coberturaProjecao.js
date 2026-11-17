import { investidoPorOrigem, origemDe, sacarDasOrigens } from './classesInvestimento';
import { totalInvestidoAte } from './investido';
import { buildDailyProjection, calcSaldo, expandOccurrences } from './projectionCalc';
import { addDays } from './formatters';

/**
 * Projeção dia a dia com o investido: total (conta + investido) e simulação do resgate.
 *
 * A Projeção mostra o saldo da CONTA (aporte é saída; resgate é entrada). Aqui cada dia ganha também o INVESTIDO
 * (aportes − resgates) e o TOTAL. Quando a conta ficaria negativa, a simulação "resgata" do investido só o que
 * falta para a conta chegar a zero — o total não muda, é dinheiro mudando de lugar — e avisa que o resgate ainda
 * precisa ser feito.
 *
 * Regras:
 *  - O resgate necessário é ACUMULADO: R(d) = maior déficit da conta desde hoje até o dia d. O dinheiro resgatado
 *    fica na conta (não volta sozinho ao investimento), então conta simulada = saldo + R e investido = investido − R.
 *  - O resgate é limitado ao que há investido; o que passar disso é `falta` (falta real, em vermelho).
 *  - Dias antes de hoje são reais (sem simulação). Resgates JÁ lançados fazem parte do saldo e do investido, então
 *    reduzem o resgate necessário naturalmente.
 *  - `adiavel`: o dia só precisa de resgate por causa de aportes planejados (depois de hoje) — bastaria adiar o aporte.
 *
 * Entrada: days (buildDailyProjection), investidoInicial (investido no dia anterior ao primeiro dia da lista),
 * carryResgate (resgate necessário acumulado de hoje até o dia anterior ao início, quando a lista começa no futuro),
 * aportesAntesDoPeriodo (aportes planejados entre amanhã e o dia anterior ao início da lista).
 * ajustes: [{ date, valor (com sinal), origem }] — rendimentos que mudam o investido sem passar pela conta.
 *
 * Retorna { [date]: { conta, investido, total, saldoReal, resgateNovo, resgateAcum, falta, adiavel, origem } }, onde `origem`
 * ([{ id, valor, liquidez }]) diz de onde sai o resgate novo do dia (reserva → caixinha → renda fixa → outro → mercado),
 * a partir de `buckets` (investidoPorOrigem no dia anterior ao início da lista).
 */
const c2 = (n) => Math.round(n * 100) / 100;

export function simularDias({ days, hoje, investidoInicial = 0, carryResgate = 0, aportesAntesDoPeriodo = 0, buckets = null, reservaGoalId = null, ajustes = [] }) {
  const out = {};
  let inv = investidoInicial;
  let aportesPlanejados = aportesAntesDoPeriodo;
  let R = carryResgate;
  let efetivoAnterior = Math.min(R, Math.max(investidoInicial, 0));
  // Investido por origem (reserva/classes): o resgate simulado sai na ordem de ORDEM_RESGATE e fica descontado dali em diante
  const bk = buckets ? { ...buckets } : null;
  if (bk && efetivoAnterior > 0) sacarDasOrigens(bk, efetivoAnterior);

  for (const d of days || []) {
    // ajustes de valor do investido (rendimento) datados neste dia: não vêm nos itens porque não movem a conta
    for (const a of ajustes) {
      if (a.date !== d.date) continue;
      inv += a.valor;
      if (bk) bk[a.origem] = (bk[a.origem] || 0) + a.valor;
    }
    for (const it of d.items || []) {
      const tipo = it.tx?.tipo;
      const valor = Number(it.valor) || 0;
      if (tipo === 'investimento') {
        inv += valor;
        if (bk) { const o = origemDe(it.tx, reservaGoalId); bk[o] = (bk[o] || 0) + valor; }
        if (d.date > hoje) aportesPlanejados += valor;
      } else if (tipo === 'entrada' && it.tx?.resgate === true) {
        inv -= valor;
        if (bk) { const o = origemDe(it.tx, reservaGoalId); bk[o] = (bk[o] || 0) - valor; }
      }
    }

    if (d.date < hoje) {
      out[d.date] = { conta: d.saldo, investido: inv, total: d.saldo + inv, saldoReal: d.saldo, resgateNovo: 0, resgateAcum: 0, falta: 0, adiavel: false };
      continue;
    }

    R = Math.max(R, -d.saldo);
    const efetivo = Math.min(R, Math.max(inv, 0));
    const resgateNovo = Math.max(0, efetivo - efetivoAnterior);
    efetivoAnterior = efetivo;
    const origem = bk && resgateNovo > 0 ? sacarDasOrigens(bk, resgateNovo) : [];
    out[d.date] = {
      conta: c2(d.saldo + efetivo),
      investido: c2(inv - efetivo),
      total: c2(d.saldo + inv),
      saldoReal: d.saldo,
      resgateNovo: Math.round(resgateNovo * 100) / 100,
      resgateAcum: Math.round(efetivo * 100) / 100,
      falta: Math.round((R - efetivo) * 100) / 100,
      adiavel: resgateNovo > 0 && d.saldo + aportesPlanejados >= 0,
      origem,
    };
  }
  return out;
}

/** Resumo do período: resgate necessário no fim, primeiro dia em que aparece e se há falta real. */
export function resumirResgates(sim) {
  const datas = Object.keys(sim || {}).sort();
  let primeiroDia = null;
  let acumulado = 0;
  let faltaMax = 0;
  for (const dt of datas) {
    const s = sim[dt];
    if (s.resgateNovo > 0 && !primeiroDia) primeiroDia = dt;
    acumulado = Math.max(acumulado, s.resgateAcum);
    faltaMax = Math.max(faltaMax, s.falta);
  }
  return { primeiroDia, acumulado, faltaMax };
}

/**
 * Base da simulação para um período que começa em `from`: investido (e investido por origem) no dia anterior, e — quando
 * o período começa no futuro — os aportes planejados e o resgate necessário já acumulados de hoje até o dia anterior.
 * Usada pelo mês/período da Projeção e pelo planejamento anual (mesma regra nos dois).
 */
export function baseDaSimulacao({ transactions, wallets, from, today, reservaGoalId = null }) {
  const dayBefore = addDays(from, -1);
  const investidoInicial = totalInvestidoAte(transactions, dayBefore);
  const buckets = investidoPorOrigem(transactions, dayBefore, reservaGoalId);
  if (from <= today) return { investidoInicial, aportesAntesDoPeriodo: 0, carryResgate: 0, buckets };
  let aportes = 0;
  for (const t of transactions) {
    if (t.tipo !== 'investimento') continue;
    for (const o of expandOccurrences(t, addDays(today, 1), dayBefore)) aportes += Number(o.valor) || 0;
  }
  const wInitials = (wallets || []).reduce((acc, w) => acc + (w.saldoInicial || 0), 0);
  const ate = buildDailyProjection(transactions, today, dayBefore, calcSaldo(transactions, '2020-01-01', addDays(today, -1)) + wInitials);
  const carryResgate = Math.max(0, ...ate.map(d => -d.saldo));
  return { investidoInicial, aportesAntesDoPeriodo: aportes, carryResgate, buckets };
}

/**
 * Números de resumo de um período com o resgate simulado (conta já com o resgate): início, fim, mínimo e máximo.
 * `inicioTotal`/`fimTotal`/`minimoTotal`/`maximoTotal` = TOTAL (conta + tudo o que está investido, caixinhas incluídas): o
 * resgate só move dinheiro de lugar, então o total não muda com ele. `inicio`/`fim`/`minimo`/`maximo` são só a conta. O mínimo
 * só fica negativo quando há FALTA real (nem o investido cobre). `jaNecessarioAntes` = há resgate acumulado, mas ele
 * começou antes deste período (sem dia de resgate novo dentro dele). Sem dias, devolve o saldo inicial bruto.
 */
export function resumirPeriodo({ days, sim, saldoInicial, base }) {
  const r = resumirResgates(sim);
  if (!days?.length) {
    return { inicio: saldoInicial, fim: saldoInicial, minimo: saldoInicial, maximo: saldoInicial, inicioTotal: saldoInicial, fimTotal: saldoInicial, minimoTotal: saldoInicial, maximoTotal: saldoInicial, fimConta: saldoInicial, fimInvestido: 0, resgateAcum: 0, primeiroDia: null, faltaMax: 0, jaNecessarioAntes: false };
  }
  const efetivoCarry = Math.min(base?.carryResgate || 0, Math.max(base?.investidoInicial || 0, 0));
  const contas = days.map(d => sim?.[d.date]?.conta ?? d.saldo);
  const totais = days.map(d => sim?.[d.date]?.total ?? d.saldo); // conta + investido (reserva, caixinhas e investimentos)
  return {
    inicio: c2(saldoInicial + efetivoCarry),
    fim: contas[contas.length - 1],
    minimo: Math.min(...contas),
    // TOTAL (conta + investido): o resgate só move dinheiro de lugar, então estes valores não dependem dele
    inicioTotal: c2(saldoInicial + (base?.investidoInicial || 0)),
    fimTotal: totais[totais.length - 1],
    minimoTotal: Math.min(...totais),
    maximoTotal: Math.max(...totais),
    fimConta: contas[contas.length - 1],
    fimInvestido: c2(totais[totais.length - 1] - contas[contas.length - 1]),
    maximo: Math.max(...contas),
    resgateAcum: r.acumulado,
    primeiroDia: r.primeiroDia,
    faltaMax: r.faltaMax,
    jaNecessarioAntes: r.acumulado > 0 && !r.primeiroDia,
  };
}
