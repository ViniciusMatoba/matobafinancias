import { describe, it, expect } from 'vitest'
import { ritmoDaReserva, projecaoReserva, rotuloMes, RITMO_CFG } from '../reservaRitmo'
import { saldoCaixinha } from '../caixinha'

/** Projeção da reserva no ritmo real de aportes. Hoje = 14/10/2026 → meses completos: jul, ago, set. */
const HOJE = '2026-10-14'
const GOAL = 'g1'

let seq = 0
const aporte = (valor, data, extra = {}) => ({ id: `a${++seq}`, tipo: 'investimento', frequencia: 'unico', dataInicio: data, valor, metaId: GOAL, descricao: 'Aporte', ...extra })
const ritmo = (txs) => ritmoDaReserva({ transactions: txs, goalId: GOAL, hoje: HOJE })

describe('ritmoDaReserva', () => {
  it('sem caixinha escolhida: não há ritmo', () => {
    expect(ritmoDaReserva({ transactions: [aporte(500, '2026-09-10')], goalId: '', hoje: HOJE })).toMatchObject({ ritmoMensal: 0, motivo: 'sem-caixinha' })
  })

  it('sem nenhum aporte nos 3 últimos meses: sem ritmo', () => {
    expect(ritmo([])).toMatchObject({ ritmoMensal: 0, mesesBase: 0, motivo: 'sem-aportes' })
    expect(ritmo([aporte(500, '2026-03-10')])).toMatchObject({ ritmoMensal: 0, motivo: 'sem-aportes' })
  })

  it('três meses iguais: o ritmo é o valor mensal', () => {
    const r = ritmo([aporte(1000, '2026-07-10'), aporte(1000, '2026-08-10'), aporte(1000, '2026-09-10')])
    expect(r).toMatchObject({ ritmoMensal: 1000, mesesBase: 3, motivo: null })
    expect(r.mensal.map(m => m.mes)).toEqual(['2026-07', '2026-08', '2026-09'])
  })

  it('a mediana não se deixa levar por um aporte isolado enorme', () => {
    expect(ritmo([aporte(500, '2026-07-10'), aporte(500, '2026-08-10'), aporte(9000, '2026-09-10')]).ritmoMensal).toBe(500)
  })

  it('meses antes do primeiro movimento da caixinha não contam como zero', () => {
    const r = ritmo([aporte(800, '2026-08-10'), aporte(1200, '2026-09-10')])
    expect(r.mesesBase).toBe(2)
    expect(r.ritmoMensal).toBe(1000) // mediana de 2 valores = média
  })

  it('meses sem aporte DEPOIS do primeiro contam como zero', () => {
    expect(ritmo([aporte(1000, '2026-07-10'), aporte(1000, '2026-09-10')]).ritmoMensal).toBe(1000) // [1000, 0, 1000]
    const fraco = ritmo([aporte(1000, '2026-07-10')]) // [1000, 0, 0] → mediana 0
    expect(fraco).toMatchObject({ ritmoMensal: 0, motivo: 'sem-aportes', mesesBase: 3 })
  })

  it('só um mês de histórico fica sinalizado', () => {
    expect(ritmo([aporte(700, '2026-09-10')])).toMatchObject({ ritmoMensal: 700, mesesBase: 1 })
  })

  it('o mês atual (incompleto) não entra', () => {
    expect(ritmo([aporte(5000, '2026-10-05')])).toMatchObject({ ritmoMensal: 0, motivo: 'sem-aportes' })
    const r = ritmo([aporte(500, '2026-09-10'), aporte(5000, '2026-10-05')])
    expect(r.ritmoMensal).toBe(500)
  })

  it('retirada (saída) da caixinha subtrai; ritmo negativo vira "sem aportes"', () => {
    const retirada = { id: 'r', tipo: 'saida', frequencia: 'unico', dataInicio: '2026-09-15', valor: 2000, metaId: GOAL, descricao: 'Resgate' }
    expect(ritmo([aporte(1000, '2026-08-10'), aporte(1000, '2026-09-10'), retirada]).ritmoMensal).toBe(0) // ago +1000, set +1000 −2000 = −1000 → mediana 0
  })

  it('entrada ligada à caixinha também soma, como na tela Metas', () => {
    const entrada = { id: 'e', tipo: 'entrada', frequencia: 'unico', dataInicio: '2026-09-02', valor: 300, metaId: GOAL, descricao: 'Rendimento' }
    expect(ritmo([entrada]).ritmoMensal).toBe(300)
  })

  it('aportes de outra caixinha ou sem caixinha são ignorados', () => {
    expect(ritmo([aporte(900, '2026-09-10', { metaId: 'outra' }), aporte(900, '2026-09-11', { metaId: undefined })]).motivo).toBe('sem-aportes')
  })

  it('aporte mensal recorrente vale todo mês no ritmo (o saldo da caixinha o conta uma vez, como na tela Metas)', () => {
    const rec = aporte(600, '2026-01-10', { frequencia: 'mensal' })
    expect(ritmo([rec])).toMatchObject({ ritmoMensal: 600, mesesBase: 3 })
    expect(saldoCaixinha([rec], GOAL)).toBe(600) // regra da tela Metas: uma vez só
  })

  it('aporte semanal recorrente soma as ocorrências do mês', () => {
    const semanal = aporte(100, '2026-06-01', { frequencia: 'semanal' })
    const r = ritmo([semanal])
    expect(r.ritmoMensal).toBeGreaterThanOrEqual(400)
    expect(r.ritmoMensal).toBeLessThanOrEqual(500)
  })

  it('ocorrência excluída de um recorrente não conta', () => {
    const rec = aporte(600, '2026-01-10', { frequencia: 'mensal', exclusoes: ['2026-08-10'] })
    expect(ritmo([rec]).mensal.find(m => m.mes === '2026-08').valor).toBe(0)
  })

  it('virada de ano: em janeiro os 3 meses completos são out, nov e dez', () => {
    const r = ritmoDaReserva({ transactions: [aporte(400, '2025-11-10')], goalId: GOAL, hoje: '2026-01-15' })
    expect(r.mensal.map(m => m.mes)).toEqual(['2025-11', '2025-12'])
  })

  it('valor e lista indefinidos não quebram', () => {
    expect(ritmoDaReserva({ transactions: undefined, goalId: GOAL, hoje: HOJE }).ritmoMensal).toBe(0)
  })
})

describe('projecaoReserva', () => {
  it('reserva já completa', () => {
    expect(projecaoReserva({ falta: 0, ritmoMensal: 500, hoje: HOJE })).toEqual({ concluida: true })
  })

  it('sem ritmo não inventa data', () => {
    expect(projecaoReserva({ falta: 5000, ritmoMensal: 0, hoje: HOJE })).toEqual({ semRitmo: true })
  })

  it('meses = falta ÷ ritmo arredondado para cima, com o mês previsto', () => {
    expect(projecaoReserva({ falta: 15000, ritmoMensal: 1500, hoje: HOJE })).toEqual({ meses: 10, previsto: '2027-08' })
    expect(projecaoReserva({ falta: 15001, ritmoMensal: 1500, hoje: HOJE })).toEqual({ meses: 11, previsto: '2027-09' })
    expect(projecaoReserva({ falta: 100, ritmoMensal: 1500, hoje: HOJE })).toEqual({ meses: 1, previsto: '2026-11' })
  })

  it('passa de ano corretamente', () => {
    expect(projecaoReserva({ falta: 4000, ritmoMensal: 1000, hoje: '2026-11-20' })).toEqual({ meses: 4, previsto: '2027-03' })
  })

  it('até 120 meses mostra a data; acima disso é "mais de 10 anos"', () => {
    expect(projecaoReserva({ falta: RITMO_CFG.tetoMeses * 100, ritmoMensal: 100, hoje: HOJE }).previsto).toBe('2036-10')
    expect(projecaoReserva({ falta: (RITMO_CFG.tetoMeses + 1) * 100, ritmoMensal: 100, hoje: HOJE })).toMatchObject({ maisDeDezAnos: true })
  })
})

describe('rotuloMes', () => {
  it.each([['2027-08', 'ago/2027'], ['2026-01', 'jan/2026'], ['2026-12', 'dez/2026']])('%s -> %s', (m, r) => {
    expect(rotuloMes(m)).toBe(r)
  })
})
