import { describe, it, expect } from 'vitest'
import { baseDaSimulacao, resumirPeriodo, simularDias } from '../coberturaProjecao'
import { buildDailyProjection, calcSaldo } from '../projectionCalc'

/**
 * Resumo da Projeção (início, fim, mínimo, máximo) com o resgate simulado: o mínimo não pode aparecer negativo quando o
 * investido cobre. Caso do relato: dezembro com −938,37 na conta e dinheiro guardado. Hoje = 17/11/2026.
 */
const HOJE = '2026-11-17'
const tx = (id, tipo, valor, dataInicio, extra = {}) => ({ id, tipo, valor, dataInicio, frequencia: 'unico', descricao: id, ...extra })

const montar = (investido, { from, to, extra = [] }) => {
  const txs = [
    tx('sal', 'entrada', 1000 + investido, '2026-10-01'),
    ...(investido ? [tx('ap', 'investimento', investido, '2026-10-02', { metaId: 'g1' })] : []),
    tx('conta', 'saida', 1938.37, '2026-12-10'),
    ...extra,
  ]
  const saldoInicial = calcSaldo(txs, '2020-01-01', new Date(new Date(from + 'T12:00:00').getTime() - 86400000).toISOString().slice(0, 10))
  const days = buildDailyProjection(txs, from, to, saldoInicial)
  const base = baseDaSimulacao({ transactions: txs, wallets: [], from, today: HOJE, reservaGoalId: 'g1' })
  const sim = simularDias({ days, hoje: HOJE, reservaGoalId: 'g1', ...base })
  const resumo = resumirPeriodo({ days, sim, saldoInicial, base })
  return { txs, days, sim, base, resumo, saldoInicial }
}

describe('resumirPeriodo — dezembro com −938,37 e dinheiro investido', () => {
  it('o mínimo é R$ 0,00 (com resgate), não −938,37; o resgate aparece com o dia', () => {
    const { resumo, days } = montar(3000, { from: '2026-12-01', to: '2026-12-31' })
    expect(Math.min(...days.map(d => d.saldo))).toBeCloseTo(-938.37, 2) // o bruto continua negativo
    expect(resumo).toMatchObject({ inicio: 1000, fim: 0, minimo: 0, maximo: 1000, resgateAcum: 938.37, primeiroDia: '2026-12-10', faltaMax: 0, jaNecessarioAntes: false })
  })

  it('mês seguinte: o resgate já era necessário antes; início e mínimo não ficam negativos', () => {
    const { resumo } = montar(3000, { from: '2027-01-01', to: '2027-01-31' })
    expect(resumo).toMatchObject({ inicio: 0, fim: 0, minimo: 0, resgateAcum: 938.37, primeiroDia: null, jaNecessarioAntes: true, faltaMax: 0 })
  })

  it('investido insuficiente: o mínimo continua negativo (falta real) e a falta aparece', () => {
    const { resumo } = montar(500, { from: '2026-12-01', to: '2026-12-31' })
    expect(resumo.minimo).toBe(-438.37) // 938,37 − 500 investidos
    expect(resumo.faltaMax).toBe(438.37)
    expect(resumo.resgateAcum).toBe(500)
  })

  it('sem nada investido: tudo igual ao saldo bruto', () => {
    const { resumo, days, saldoInicial } = montar(0, { from: '2026-12-01', to: '2026-12-31' })
    expect(resumo.inicio).toBe(saldoInicial)
    expect(resumo.minimo).toBeCloseTo(Math.min(...days.map(d => d.saldo)), 2)
    expect(resumo.resgateAcum).toBe(0)
    expect(resumo.faltaMax).toBeGreaterThan(0)
  })

  it('resgate já lançado no dia: some a necessidade e o mínimo vem da conta real', () => {
    const rg = tx('rg', 'entrada', 938.37, '2026-12-10', { resgate: true, metaId: 'g1' })
    const { resumo } = montar(3000, { from: '2026-12-01', to: '2026-12-31', extra: [rg] })
    expect(resumo).toMatchObject({ minimo: 0, resgateAcum: 0, primeiroDia: null, jaNecessarioAntes: false })
    expect(resumo.fim).toBe(0)
  })

  it('período com dias antes de hoje: esses dias são reais (negativo real continua negativo)', () => {
    const txs = [tx('sal', 'entrada', 200, '2026-10-01'), tx('ap', 'investimento', 3000, '2026-10-02'), tx('c', 'saida', 500, '2026-11-10')]
    const saldoInicial = calcSaldo(txs, '2020-01-01', '2026-10-31')
    const days = buildDailyProjection(txs, '2026-11-01', '2026-11-30', saldoInicial)
    const base = baseDaSimulacao({ transactions: txs, wallets: [], from: '2026-11-01', today: HOJE })
    const sim = simularDias({ days, hoje: HOJE, ...base })
    const resumo = resumirPeriodo({ days, sim, saldoInicial, base })
    expect(sim['2026-11-10'].conta).toBe(sim['2026-11-10'].saldoReal) // passado: real
    expect(resumo.minimo).toBeLessThan(0)
  })

  it('sem dias: devolve o saldo inicial', () => {
    expect(resumirPeriodo({ days: [], sim: {}, saldoInicial: 123 })).toMatchObject({ inicio: 123, fim: 123, minimo: 123, maximo: 123, resgateAcum: 0 })
  })
})

describe('baseDaSimulacao', () => {
  it('início no futuro herda o resgate acumulado e os aportes planejados', () => {
    const txs = [
      tx('sal', 'entrada', 4000, '2026-10-01'), tx('ap0', 'investimento', 3000, '2026-10-02'),
      tx('c', 'saida', 1300, '2026-11-20'),                   // conta 1000 → −300 em 20/11
      tx('ap1', 'investimento', 100, '2026-11-25'),            // aporte planejado antes de dezembro
    ]
    const b = baseDaSimulacao({ transactions: txs, wallets: [], from: '2026-12-01', today: HOJE })
    expect(b.carryResgate).toBe(400)               // pior ponto: 1000 − 1300 − 100 = −400
    expect(b.aportesAntesDoPeriodo).toBe(100)
    expect(b.investidoInicial).toBe(3100)
  })
  it('início hoje ou no passado: sem carry', () => {
    const b = baseDaSimulacao({ transactions: [], wallets: [], from: '2026-11-01', today: HOJE })
    expect(b).toMatchObject({ carryResgate: 0, aportesAntesDoPeriodo: 0, investidoInicial: 0 })
  })
})
