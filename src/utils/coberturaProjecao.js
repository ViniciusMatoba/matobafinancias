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
 *
 * Retorna { [date]: { conta, investido, total, saldoReal, resgateNovo, resgateAcum, falta, adiavel } }.
 */
const c2 = (n) => Math.round(n * 100) / 100;

export function simularDias({ days, hoje, investidoInicial = 0, carryResgate = 0, aportesAntesDoPeriodo = 0 }) {
  const out = {};
  let inv = investidoInicial;
  let aportesPlanejados = aportesAntesDoPeriodo;
  let R = carryResgate;
  let efetivoAnterior = Math.min(R, Math.max(investidoInicial, 0));

  for (const d of days || []) {
    for (const it of d.items || []) {
      const tipo = it.tx?.tipo;
      const valor = Number(it.valor) || 0;
      if (tipo === 'investimento') {
        inv += valor;
        if (d.date > hoje) aportesPlanejados += valor;
      } else if (tipo === 'entrada' && it.tx?.resgate === true) {
        inv -= valor;
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
    out[d.date] = {
      conta: c2(d.saldo + efetivo),
      investido: c2(inv - efetivo),
      total: c2(d.saldo + inv),
      saldoReal: d.saldo,
      resgateNovo: Math.round(resgateNovo * 100) / 100,
      resgateAcum: Math.round(efetivo * 100) / 100,
      falta: Math.round((R - efetivo) * 100) / 100,
      adiavel: resgateNovo > 0 && d.saldo + aportesPlanejados >= 0,
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
