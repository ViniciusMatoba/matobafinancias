/**
 * Dias de saldo negativo na Projeção: de onde vem o negativo e se o dinheiro guardado cobre.
 *
 * A Projeção mostra o saldo da CONTA (investimento é saída da conta). Um dia negativo pode ser:
 *  - 'aporte':  o saldo seria positivo sem os aportes planejados (investimentos ainda por vir) — dinheiro seu,
 *               basta adiar o aporte;
 *  - 'reserva': a conta fica negativa, mas a reserva de emergência (liquidez imediata) cobre o buraco;
 *  - 'falta':   nem a reserva cobre — falta dinheiro de verdade (`falta` = quanto sobra descoberto).
 *
 * Só a reserva conta como cobertura (resgate imediato), no valor de hoje (conservador: aportes futuros não somam).
 * Aportes "planejados" são os investimentos com data depois de hoje; os de antes de hoje já aconteceram e não dá
 * para desfazê-los. `aportesAntesDoPeriodo` = aportes planejados entre amanhã e o dia anterior ao início da
 * lista (quando a lista começa no futuro), já descontados do saldo inicial.
 *
 * Retorna { [date]: { tipo, deficit, falta? } } só para os dias com saldo < 0.
 */
export function classificarDiasNegativos({ days, reservaLiquida = 0, hoje, aportesAntesDoPeriodo = 0 }) {
  const out = {};
  let aportesPlanejados = aportesAntesDoPeriodo;
  for (const d of days || []) {
    if (d.date > hoje) {
      for (const it of d.items || []) {
        if (it.tx?.tipo === 'investimento') aportesPlanejados += Number(it.valor) || 0;
      }
    }
    if (!(d.saldo < 0)) continue;
    const deficit = -d.saldo;
    if (d.saldo + aportesPlanejados >= 0) {
      out[d.date] = { tipo: 'aporte', deficit };
    } else if (reservaLiquida >= deficit) {
      out[d.date] = { tipo: 'reserva', deficit };
    } else {
      out[d.date] = { tipo: 'falta', deficit, falta: Math.round((deficit - reservaLiquida) * 100) / 100 };
    }
  }
  return out;
}
