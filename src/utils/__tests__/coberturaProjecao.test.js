import { describe, it, expect } from 'vitest'
import { simularDias, resumirResgates } from '../coberturaProjecao'
import { buildDailyProjection } from '../projectionCalc'
import { totalInvestidoAte } from '../investido'

/** Projeção com investido: total, simulação do resgate e aviso. Hoje = 19/11/2026. */
const HOJE = '2026-11-19'
const tx = (id, tipo, valor, dataInicio, extra = {}) => ({ id, tipo, valor, dataInicio, frequencia: 'unico', descricao: id, ...extra })

/** Caso do exemplo combinado: conta 1.200, investido 6.000; aporte 1.500 (20), luz 400 (21), salário 5.000 (25). */
const cenario = (extra = []) => {
  const txs = [
    tx('ap0', 'investimento', 6000, '2026-10-01'),
    tx('ap', 'investimento', 1500, '2026-11-20'),
    tx('luz', 'saida', 400, '2026-11-21'),
    tx('sal', 'entrada', 5000, '2026-11-25'),
    ...extra,
  ]
  const days = buildDailyProjection(txs, '2026-11-19', '2026-11-30', 1200)
  const sim = simularDias({ days, hoje: HOJE, investidoInicial: totalInvestidoAte(txs, '2026-11-18') })
  return { txs, days, sim }
}

describe('simularDias — exemplo combinado', () => {
  it('dia 19: nada a resgatar, total = conta + investido', () => {
    const { sim } = cenario()
    expect(sim['2026-11-19']).toMatchObject({ conta: 1200, investido: 6000, total: 7200, resgateNovo: 0, falta: 0 })
  })

  it('dia 20: o aporte deixa a conta em −300: simula resgate de 300 e a conta zera', () => {
    const { sim } = cenario()
    expect(sim['2026-11-20']).toMatchObject({ saldoReal: -300, conta: 0, investido: 6000 + 1500 - 300, total: 7200, resgateNovo: 300, resgateAcum: 300, falta: 0 })
    expect(sim['2026-11-20'].adiavel).toBe(true) // só é preciso por causa do aporte planejado
  })

  it('dia 21: a conta de luz exige mais 400 (acumulado 700) e o total cai 400', () => {
    const { sim } = cenario()
    expect(sim['2026-11-21']).toMatchObject({ conta: 0, investido: 6800, total: 6800, resgateNovo: 400, resgateAcum: 700 })
    expect(sim['2026-11-21'].adiavel).toBe(true) // sem o aporte (1.500) o saldo seria +800
  })

  it('dia 25: o salário volta a conta ao positivo; o dinheiro resgatado ficou na conta e o investido continua reduzido', () => {
    const { sim } = cenario()
    expect(sim['2026-11-25']).toMatchObject({ saldoReal: 4300, conta: 5000, investido: 6800, total: 11800, resgateNovo: 0, resgateAcum: 700 })
  })

  it('o total nunca é alterado pela simulação (total = saldo real + investido real)', () => {
    const { days, sim } = cenario()
    for (const d of days) expect(sim[d.date].conta + sim[d.date].investido).toBeCloseTo(sim[d.date].total, 6)
  })

  it('resumo do período', () => {
    const { sim } = cenario()
    expect(resumirResgates(sim)).toEqual({ primeiroDia: '2026-11-20', acumulado: 700, faltaMax: 0 })
  })
})

describe('simularDias — regras', () => {
  it('sem investido: o negativo vira "falta" e a conta continua negativa', () => {
    const txs = [tx('luz', 'saida', 900, '2026-11-21')]
    const days = buildDailyProjection(txs, '2026-11-19', '2026-11-22', 500)
    const sim = simularDias({ days, hoje: HOJE, investidoInicial: 0 })
    expect(sim['2026-11-21']).toMatchObject({ conta: -400, resgateAcum: 0, falta: 400, resgateNovo: 0 })
  })

  it('investido insuficiente: resgata o que tem e o resto é falta (caso −297,85 com investido de 100)', () => {
    const txs = [tx('luz', 'saida', 797.85, '2026-11-21')]
    const days = buildDailyProjection(txs, '2026-11-19', '2026-11-22', 500)
    const sim = simularDias({ days, hoje: HOJE, investidoInicial: 100 })
    expect(sim['2026-11-21']).toMatchObject({ conta: -197.85, investido: 0, resgateNovo: 100, resgateAcum: 100, falta: 197.85 })
  })

  it('o caso do relato: −297,85 com R$ 3.000 investidos vira resgate de 297,85 e a conta zera', () => {
    const txs = [tx('c', 'saida', 797.85, '2026-11-21')]
    const days = buildDailyProjection(txs, '2026-11-19', '2026-11-22', 500)
    const sim = simularDias({ days, hoje: HOJE, investidoInicial: 3000 })
    expect(sim['2026-11-21']).toMatchObject({ conta: 0, investido: 3000 - 297.85, resgateNovo: 297.85, falta: 0 })
    expect(sim['2026-11-21'].adiavel).toBe(false) // não há aporte planejado: o resgate é a saída
  })

  it('dias antes de hoje são reais (sem simulação), mas já mostram o investido', () => {
    const txs = [tx('ap', 'investimento', 700, '2026-11-17'), tx('luz', 'saida', 900, '2026-11-18')]
    const days = buildDailyProjection(txs, '2026-11-17', '2026-11-19', 500)
    const sim = simularDias({ days, hoje: HOJE, investidoInicial: 2000 })
    expect(sim['2026-11-18']).toMatchObject({ saldoReal: -1100, conta: -1100, resgateNovo: 0, resgateAcum: 0 })
    expect(sim['2026-11-17'].investido).toBe(2700)
  })

  it('resgate JÁ lançado entra no saldo e no investido: a necessidade some', () => {
    const { sim } = cenario([tx('rg', 'entrada', 300, '2026-11-20', { resgate: true })])
    expect(sim['2026-11-20']).toMatchObject({ saldoReal: 0, resgateNovo: 0, resgateAcum: 0, investido: 6000 + 1500 - 300 })
  })

  it('lista que começa no futuro herda o resgate acumulado e o investido', () => {
    const txs = [tx('luz', 'saida', 100, '2026-12-02')]
    const days = buildDailyProjection(txs, '2026-12-01', '2026-12-03', 1000)
    const sim = simularDias({ days, hoje: HOJE, investidoInicial: 5000, carryResgate: 700 })
    expect(sim['2026-12-02']).toMatchObject({ saldoReal: 900, conta: 1600, investido: 4300, total: 5900, resgateNovo: 0, resgateAcum: 700 })
  })

  it('sem entrada não quebra', () => {
    expect(simularDias({ days: undefined, hoje: HOJE })).toEqual({})
    expect(resumirResgates({})).toEqual({ primeiroDia: null, acumulado: 0, faltaMax: 0 })
  })
})
