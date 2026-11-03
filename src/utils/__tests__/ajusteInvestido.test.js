import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { docAjusteValor, investidoPorOrigem, origemDe, valoresDoInvestido, agruparAportes } from '../classesInvestimento'
import { ehAjuste, totalInvestidoAte } from '../investido'
import { saldoCaixinha, reservaDaCaixinha } from '../caixinha'
import { expandOccurrences, calcSaldo, buildDailyProjection } from '../projectionCalc'
import { expandDespesas } from '../despesas'
import { simularDias } from '../coberturaProjecao'

const require = createRequire(import.meta.url)
const B = require('../../../functions/lib/motor/investido')
const { saldoCaixinhaBot } = require('../../../functions/lib/motor/caixinha')
const { expandRange, calcSaldoSimples } = require('../../../functions/lib/motor/caixa')
const { expandDespesasBot } = require('../../../functions/lib/motor/competencia')

/** Atualizar valor (rendimento) do investido. Hoje = 03/11/2026. */
const HOJE = '2026-11-03'
const tx = (id, tipo, valor, dataInicio, extra = {}) => ({ id, tipo, valor, dataInicio, frequencia: 'unico', descricao: id, ...extra })
const goals = [{ id: 'g1', nome: 'Reserva de emergência' }, { id: 'g2', nome: 'Viagem' }]
const base = [
  tx('sal', 'entrada', 9000, '2026-09-01'),
  tx('res', 'investimento', 3000, '2026-09-02', { metaId: 'g1' }),
  tx('vi', 'investimento', 800, '2026-09-03', { metaId: 'g2' }),
  tx('ac', 'investimento', 2000, '2026-09-04', { classeInvestimento: 'acoes' }),
]
const rendimento = { ...docAjusteValor({ alvo: { tipo: 'caixinha', id: 'g1' }, nome: 'Reserva', atual: 3000, real: 3180.5, data: HOJE }), id: 'aj1' }

describe('docAjusteValor', () => {
  it('grava a diferença (rendimento) ligada à caixinha, sem classe', () => {
    expect(rendimento).toMatchObject({ tipo: 'investimento', ajuste: true, valor: 180.5, metaId: 'g1', classeInvestimento: null, dataInicio: HOJE, conferido: true })
    expect(ehAjuste(rendimento)).toBe(true)
  })
  it('perda vira ajuste negativo; classe leva a classeInvestimento', () => {
    const d = docAjusteValor({ alvo: { tipo: 'classe', id: 'acoes' }, nome: 'Ações', atual: 2000, real: 1850, data: HOJE })
    expect(d).toMatchObject({ valor: -150, metaId: null, classeInvestimento: 'acoes' })
  })
  it('sem diferença não gera lançamento', () => {
    expect(docAjusteValor({ alvo: { tipo: 'caixinha', id: 'g1' }, nome: 'x', atual: 100, real: 100.001, data: HOJE })).toBeNull()
  })
})

describe('o ajuste NÃO mexe na conta nem nos gastos', () => {
  const l = [...base, rendimento]
  it('nenhuma ocorrência (nem app nem bot)', () => {
    expect(expandOccurrences(rendimento, '2020-01-01', '2030-01-01')).toEqual([])
    expect(expandRange([rendimento], '2020-01-01', '2030-01-01')).toEqual([])
  })
  it('saldo da conta e despesas por competência iguais com ou sem o ajuste', () => {
    expect(calcSaldo(l, '2020-01-01', HOJE)).toBe(calcSaldo(base, '2020-01-01', HOJE))
    expect(calcSaldoSimples(l, HOJE, 0)).toBe(calcSaldoSimples(base, HOJE, 0))
    expect(expandDespesas(l, '2026-01-01', '2026-12-31')).toEqual(expandDespesas(base, '2026-01-01', '2026-12-31'))
    expect(expandDespesasBot(l, '2026-01-01', '2026-12-31')).toEqual(expandDespesasBot(base, '2026-01-01', '2026-12-31'))
  })
  it('não aparece como grupo de aportes a reclassificar', () => {
    expect(agruparAportes(l, HOJE).some(g => g.ids.includes('aj1'))).toBe(false)
  })
})

describe('o ajuste entra nos totais de investido e na caixinha', () => {
  const l = [...base, rendimento]
  it('total investido, saldo e reserva sobem; app e bot iguais', () => {
    const antes = totalInvestidoAte(base, HOJE)
    expect(totalInvestidoAte(l, HOJE)).toBe(antes + 180.5)
    expect(B.totalInvestidoAteBot(l, HOJE)).toBe(antes + 180.5)
    expect(saldoCaixinha(l, 'g1')).toBe(3180.5)
    expect(saldoCaixinhaBot(l, 'g1')).toBe(3180.5)
    expect(reservaDaCaixinha(l, goals, 'g1')).toBe(3180.5)
  })
  it('ajuste datado depois da data consultada ainda não conta', () => {
    expect(totalInvestidoAte(l, '2026-11-02')).toBe(totalInvestidoAte(base, '2026-11-02'))
  })
  it('por origem: reserva recebe o ajuste da caixinha da reserva', () => {
    expect(investidoPorOrigem(l, HOJE, 'g1').reserva).toBe(3180.5)
  })
})

describe('caixinha aparece como caixinha (não como "Outro")', () => {
  it('aporte de caixinha sem classe é "caixinha"; sem caixinha e sem classe é "outro"; reserva é "reserva"', () => {
    expect(origemDe(base[2], 'g1')).toBe('caixinha')
    expect(origemDe(base[1], 'g1')).toBe('reserva')
    expect(origemDe(tx('x', 'investimento', 1, HOJE), 'g1')).toBe('outro')
    expect(investidoPorOrigem(base, HOJE, 'g1')).toEqual({ reserva: 3000, caixinha: 800, acoes: 2000 })
  })
  it('valoresDoInvestido separa caixinhas (com rendimento) e classes sem caixinha', () => {
    const v = valoresDoInvestido({ transactions: [...base, rendimento], goals, hoje: HOJE, reservaGoalId: 'g1' })
    expect(v.caixinhas).toEqual([
      { id: 'g1', nome: 'Reserva de emergência', reserva: true, valor: 3180.5 },
      { id: 'g2', nome: 'Viagem', reserva: false, valor: 800 },
    ])
    expect(v.classes).toEqual([{ id: 'acoes', label: 'Ações', valor: 2000 }])
    expect(v.total).toBe(3000 + 800 + 2000 + 180.5)
  })
})

describe('Projeção com ajuste dentro do período', () => {
  it('o ajuste do dia soma no investido dali em diante, sem mexer na conta', () => {
    const l = [...base, rendimento]
    const days = buildDailyProjection(l, '2026-11-01', '2026-11-05', 1000)
    const sim = simularDias({
      days, hoje: HOJE, investidoInicial: totalInvestidoAte(l, '2026-10-31'),
      ajustes: [{ date: HOJE, valor: 180.5, origem: 'reserva' }],
    })
    expect(sim['2026-11-02'].investido).toBe(5800)
    expect(sim['2026-11-03'].investido).toBe(5980.5)
    expect(sim['2026-11-05'].investido).toBe(5980.5)
    expect(sim['2026-11-03'].conta).toBe(sim['2026-11-02'].conta)
  })
})
