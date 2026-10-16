import { describe, it, expect } from 'vitest'
import { investidoPorOrigem, sacarDasOrigens, origemDe } from '../classesInvestimento'
import { simularDias } from '../coberturaProjecao'
import { docsResgate, totalInvestidoAte } from '../investido'
import { buildDailyProjection } from '../projectionCalc'

/** O resgate sai na ordem: reserva → caixinha → renda fixa/outro → mercado. Hoje = 19/11/2026. */
const HOJE = '2026-11-19'
const tx = (id, tipo, valor, dataInicio, extra = {}) => ({ id, tipo, valor, dataInicio, frequencia: 'unico', descricao: id, ...extra })

const carteira = [
  tx('res', 'investimento', 250, '2026-10-01', { metaId: 'g1', classeInvestimento: 'caixinha' }),
  tx('cx', 'investimento', 400, '2026-10-02', { classeInvestimento: 'caixinha' }),
  tx('rf', 'investimento', 1000, '2026-10-03', { classeInvestimento: 'renda_fixa' }),
  tx('ac', 'investimento', 2000, '2026-10-04', { classeInvestimento: 'acoes' }),
  tx('sem', 'investimento', 100, '2026-10-05'),
]

describe('investidoPorOrigem / sacarDasOrigens', () => {
  it('separa reserva (por metaId) e classes; sem classe vai para "outro"', () => {
    expect(investidoPorOrigem(carteira, HOJE, 'g1')).toEqual({ reserva: 250, caixinha: 400, renda_fixa: 1000, acoes: 2000, outro: 100 })
    expect(origemDe(carteira[0], null)).toBe('caixinha') // sem reserva escolhida, usa a classe
  })

  it('resgates descontam da origem certa', () => {
    const l = [...carteira, tx('rg', 'entrada', 150, '2026-11-01', { resgate: true, classeInvestimento: 'acoes' })]
    expect(investidoPorOrigem(l, HOJE, 'g1').acoes).toBe(1850)
  })

  it('tira na ordem de resgate e muda os buckets', () => {
    const b = investidoPorOrigem(carteira, HOJE, 'g1')
    expect(sacarDasOrigens(b, 700)).toEqual([
      { id: 'reserva', valor: 250, liquidez: 'imediata' },
      { id: 'caixinha', valor: 400, liquidez: 'imediata' },
      { id: 'renda_fixa', valor: 50, liquidez: 'prazo' },
    ])
    expect(b).toMatchObject({ reserva: 0, caixinha: 0, renda_fixa: 950 })
    expect(sacarDasOrigens(b, 3000).map(o => o.id)).toEqual(['renda_fixa', 'outro', 'acoes'])
  })
})

describe('simularDias com origem', () => {
  const txs = [...carteira, tx('luz', 'saida', 1800, '2026-11-21')]
  const rodar = (extra = {}) => {
    const days = buildDailyProjection(txs, HOJE, '2026-11-30', 1000)
    return simularDias({
      days, hoje: HOJE, investidoInicial: totalInvestidoAte(txs, '2026-11-18'),
      buckets: investidoPorOrigem(txs, '2026-11-18', 'g1'), reservaGoalId: 'g1', ...extra,
    })
  }

  it('déficit de 800: reserva (250) + caixinha (400) + renda fixa (150)', () => {
    const sim = rodar()['2026-11-21']
    expect(sim.saldoReal).toBe(-800)
    expect(sim.origem).toEqual([
      { id: 'reserva', valor: 250, liquidez: 'imediata' },
      { id: 'caixinha', valor: 400, liquidez: 'imediata' },
      { id: 'renda_fixa', valor: 150, liquidez: 'prazo' },
    ])
    expect(sim.origem.reduce((s, o) => s + o.valor, 0)).toBe(sim.resgateNovo)
  })

  it('segundo resgate continua de onde parou (não reaproveita o que já foi sacado)', () => {
    const t2 = [...txs, tx('gas', 'saida', 500, '2026-11-22')]
    const days = buildDailyProjection(t2, HOJE, '2026-11-30', 1000)
    const sim = simularDias({ days, hoje: HOJE, investidoInicial: totalInvestidoAte(t2, '2026-11-18'), buckets: investidoPorOrigem(t2, '2026-11-18', 'g1'), reservaGoalId: 'g1' })
    expect(sim['2026-11-22'].origem).toEqual([{ id: 'renda_fixa', valor: 500, liquidez: 'prazo' }])
  })

  it('sem buckets a simulação continua igual e origem vem vazia', () => {
    const sim = rodar({ buckets: null })['2026-11-21']
    expect(sim.resgateNovo).toBe(800)
    expect(sim.origem).toEqual([])
  })

  it('o total (conta + investido) não muda com a origem', () => {
    const r = rodar(); const sem = rodar({ buckets: null })
    for (const d of Object.keys(r)) expect(r[d].total).toBe(sem[d].total)
  })
})

describe('docsResgate com origem', () => {
  it('um lançamento por origem: reserva com metaId, classes com classeInvestimento', () => {
    const docs = docsResgate({
      valor: 800, data: '2026-11-21', hoje: HOJE, reservaGoalId: 'g1',
      origem: [{ id: 'reserva', valor: 250, label: 'Reserva' }, { id: 'caixinha', valor: 400, label: 'Caixinha / resgate imediato' }, { id: 'renda_fixa', valor: 150, label: 'Renda Fixa' }],
    })
    expect(docs.map(d => [d.valor, d.metaId ?? null, d.classeInvestimento ?? null])).toEqual([[250, 'g1', null], [400, null, 'caixinha'], [150, null, 'renda_fixa']])
    expect(docs.every(d => d.tipo === 'entrada' && d.resgate === true && d.conferido === false)).toBe(true)
  })

  it('depois de lançados, o aviso some e os buckets refletem os resgates', () => {
    const docs = docsResgate({
      valor: 800, data: '2026-11-21', hoje: HOJE, reservaGoalId: 'g1',
      origem: [{ id: 'reserva', valor: 250 }, { id: 'caixinha', valor: 400 }, { id: 'renda_fixa', valor: 150 }],
    }).map((d, i) => ({ ...d, id: `rg${i}` }))
    const l = [...carteira, tx('luz', 'saida', 1800, '2026-11-21'), ...docs]
    const days = buildDailyProjection(l, HOJE, '2026-11-30', 1000)
    const sim = simularDias({ days, hoje: HOJE, investidoInicial: totalInvestidoAte(l, '2026-11-18'), buckets: investidoPorOrigem(l, '2026-11-18', 'g1'), reservaGoalId: 'g1' })
    expect(sim['2026-11-21'].resgateNovo).toBe(0)
    expect(investidoPorOrigem(l, '2026-11-21', 'g1')).toMatchObject({ reserva: 0, caixinha: 0, renda_fixa: 850 })
  })
})
