import { describe, it, expect } from 'vitest'
import { classificarDiasNegativos } from '../coberturaProjecao'
import { buildDailyProjection } from '../projectionCalc'

/** Dias negativos da Projeção: por aporte, reserva cobre, ou falta de verdade. Hoje = 10/11/2026. */
const HOJE = '2026-11-10'

const dia = (date, saldo, itens = []) => ({ date, saldo, items: itens })
const aporte = (valor) => ({ valor, tx: { tipo: 'investimento' } })
const saida = (valor) => ({ valor, tx: { tipo: 'saida' } })

describe('classificarDiasNegativos', () => {
  it('dias com saldo positivo ou zero não recebem classificação', () => {
    expect(classificarDiasNegativos({ days: [dia('2026-11-12', 500), dia('2026-11-13', 0)], reservaLiquida: 999, hoje: HOJE })).toEqual({})
  })

  it('negativo causado só por aporte planejado: "aporte"', () => {
    const days = [dia('2026-11-20', -1200, [aporte(1500), saida(300)])] // sem o aporte: +300
    expect(classificarDiasNegativos({ days, reservaLiquida: 0, hoje: HOJE })['2026-11-20']).toEqual({ tipo: 'aporte', deficit: 1200 })
  })

  it('o aporte tem prioridade sobre a reserva (o dinheiro é seu e dá para adiar)', () => {
    const days = [dia('2026-11-20', -1200, [aporte(1500)])]
    expect(classificarDiasNegativos({ days, reservaLiquida: 50000, hoje: HOJE })['2026-11-20'].tipo).toBe('aporte')
  })

  it('negativo que a reserva cobre: "reserva"', () => {
    const days = [dia('2026-11-21', -2300, [saida(3300)])]
    expect(classificarDiasNegativos({ days, reservaLiquida: 18000, hoje: HOJE })['2026-11-21']).toEqual({ tipo: 'reserva', deficit: 2300 })
  })

  it('reserva exatamente igual ao buraco ainda cobre', () => {
    const days = [dia('2026-11-21', -1000, [saida(1000)])]
    expect(classificarDiasNegativos({ days, reservaLiquida: 1000, hoje: HOJE })['2026-11-21'].tipo).toBe('reserva')
  })

  it('nem a reserva cobre: "falta" com o valor que sobra descoberto', () => {
    const days = [dia('2026-11-24', -19100, [saida(20000)])]
    expect(classificarDiasNegativos({ days, reservaLiquida: 18000, hoje: HOJE })['2026-11-24']).toEqual({ tipo: 'falta', deficit: 19100, falta: 1100 })
  })

  it('sem reserva nenhuma, qualquer negativo sem aporte é "falta" do valor inteiro', () => {
    const days = [dia('2026-11-21', -400, [saida(400)])]
    expect(classificarDiasNegativos({ days, reservaLiquida: 0, hoje: HOJE })['2026-11-21']).toEqual({ tipo: 'falta', deficit: 400, falta: 400 })
  })

  it('aportes acumulam dia a dia: aporte de um dia anterior também conta nos dias seguintes', () => {
    const days = [
      dia('2026-11-15', 200, [aporte(1000)]),
      dia('2026-11-16', -300, [saida(500)]),       // sem os 1000 de aporte: +700 → "aporte"
    ]
    expect(classificarDiasNegativos({ days, reservaLiquida: 0, hoje: HOJE })['2026-11-16'].tipo).toBe('aporte')
  })

  it('aporte de antes de hoje já aconteceu e não conta como "adiável"', () => {
    const days = [dia('2026-11-05', -500, [aporte(1000)])]
    expect(classificarDiasNegativos({ days, reservaLiquida: 0, hoje: HOJE })['2026-11-05'].tipo).toBe('falta')
  })

  it('aportes planejados entre hoje e o início da lista entram pelo parâmetro', () => {
    const days = [dia('2026-12-02', -800, [saida(800)])]
    expect(classificarDiasNegativos({ days, reservaLiquida: 0, hoje: HOJE })['2026-12-02'].tipo).toBe('falta')
    expect(classificarDiasNegativos({ days, reservaLiquida: 0, hoje: HOJE, aportesAntesDoPeriodo: 1000 })['2026-12-02'].tipo).toBe('aporte')
  })

  it('só aporte conta como "aporte" (outro tipo de saída não)', () => {
    const days = [dia('2026-11-20', -300, [saida(1500)])]
    expect(classificarDiasNegativos({ days, reservaLiquida: 0, hoje: HOJE })['2026-11-20'].tipo).toBe('falta')
  })

  it('entradas indefinidas não quebram', () => {
    expect(classificarDiasNegativos({ days: undefined, hoje: HOJE })).toEqual({})
    expect(classificarDiasNegativos({ days: [dia('2026-11-20', -10)], hoje: HOJE })['2026-11-20'].tipo).toBe('falta')
  })

  it('integrado com a projeção real: salário atrasado + aporte recorrente + reserva', () => {
    const txs = [
      { id: 'a', tipo: 'investimento', frequencia: 'unico', dataInicio: '2026-11-20', valor: 1500, descricao: 'Aporte' },
      { id: 'c', tipo: 'saida', frequencia: 'unico', dataInicio: '2026-11-21', valor: 600, descricao: 'Conta' },
      { id: 's', tipo: 'entrada', frequencia: 'unico', dataInicio: '2026-11-25', valor: 5000, descricao: 'Salário' },
    ]
    const days = buildDailyProjection(txs, '2026-11-10', '2026-11-30', 1000)
    const r = classificarDiasNegativos({ days, reservaLiquida: 3000, hoje: HOJE })
    expect(r['2026-11-20']).toMatchObject({ tipo: 'aporte', deficit: 500 })   // 1000 − 1500
    expect(r['2026-11-21']).toMatchObject({ tipo: 'aporte', deficit: 1100 })  // sem o aporte: +400
    expect(r['2026-11-25']).toBeUndefined()                                   // salário voltou ao positivo
  })
})
