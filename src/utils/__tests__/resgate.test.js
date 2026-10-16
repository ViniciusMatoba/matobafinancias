import { describe, it, expect } from 'vitest'
import { docsResgate, totalInvestidoAte } from '../investido'
import { saldoCaixinha } from '../caixinha'
import { simularDias } from '../coberturaProjecao'
import { buildDailyProjection, calcSaldo } from '../projectionCalc'

/** Botão "Lançar resgate": documentos gerados e efeito depois de lançados. Hoje = 19/11/2026. */
const HOJE = '2026-11-19'
const tx = (id, tipo, valor, dataInicio, extra = {}) => ({ id, tipo, valor, dataInicio, frequencia: 'unico', descricao: id, ...extra })

describe('docsResgate', () => {
  it('sai primeiro da reserva (com metaId) quando ela cobre tudo', () => {
    const docs = docsResgate({ valor: 300, data: '2026-11-20', hoje: HOJE, reservaDisponivel: 3000, reservaGoalId: 'g1' })
    expect(docs).toHaveLength(1)
    expect(docs[0]).toMatchObject({ tipo: 'entrada', resgate: true, valor: 300, metaId: 'g1', dataInicio: '2026-11-20', frequencia: 'unico', conferido: false })
  })

  it('reserva não cobre tudo: um lançamento da reserva e outro do investimento geral', () => {
    const docs = docsResgate({ valor: 700, data: '2026-11-21', hoje: HOJE, reservaDisponivel: 250, reservaGoalId: 'g1' })
    expect(docs.map(d => [d.valor, d.metaId ?? null])).toEqual([[250, 'g1'], [450, null]])
    expect(docs.reduce((s, d) => s + d.valor, 0)).toBe(700)
  })

  it('sem reserva escolhida: tudo do investimento geral, sem metaId', () => {
    const docs = docsResgate({ valor: 297.85, data: HOJE, hoje: HOJE, reservaDisponivel: 5000, reservaGoalId: null })
    expect(docs).toHaveLength(1)
    expect(docs[0].metaId).toBeUndefined()
    expect(docs[0]).toMatchObject({ valor: 297.85, conferido: true }) // hoje: o dinheiro já voltou
  })

  it('valor zero ou inválido não gera lançamento', () => {
    expect(docsResgate({ valor: 0, data: HOJE, hoje: HOJE })).toEqual([])
    expect(docsResgate({ valor: 'x', data: HOJE, hoje: HOJE })).toEqual([])
  })
})

describe('depois de lançar o resgate', () => {
  const base = [
    tx('ap0', 'investimento', 6000, '2026-10-01', { metaId: 'g1' }),
    tx('ap', 'investimento', 1500, '2026-11-20'),
    tx('luz', 'saida', 400, '2026-11-21'),
  ]
  const simular = (txs) => {
    const days = buildDailyProjection(txs, HOJE, '2026-11-30', 1200)
    return simularDias({ days, hoje: HOJE, investidoInicial: totalInvestidoAte(txs, '2026-11-18') })
  }

  it('antes: pede resgate; depois de lançar os dois resgates sugeridos o aviso some e o total é o mesmo', () => {
    const antes = simular(base)
    expect(antes['2026-11-21'].resgateAcum).toBe(700)

    const docs = [
      ...docsResgate({ valor: antes['2026-11-20'].resgateNovo, data: '2026-11-20', hoje: HOJE, reservaDisponivel: 6000, reservaGoalId: 'g1' }),
      ...docsResgate({ valor: antes['2026-11-21'].resgateNovo, data: '2026-11-21', hoje: HOJE, reservaDisponivel: 5700, reservaGoalId: 'g1' }),
    ].map((d, i) => ({ ...d, id: `rg${i}` }))
    const depois = simular([...base, ...docs])

    expect(depois['2026-11-20'].resgateNovo).toBe(0)
    expect(depois['2026-11-21'].resgateNovo).toBe(0)
    expect(depois['2026-11-21']).toMatchObject({ saldoReal: 0, conta: 0, investido: antes['2026-11-21'].investido })
    expect(depois['2026-11-21'].total).toBe(antes['2026-11-21'].total)
  })

  it('o resgate da reserva diminui o saldo da caixinha e entra no caixa', () => {
    const docs = docsResgate({ valor: 700, data: HOJE, hoje: HOJE, reservaDisponivel: 6000, reservaGoalId: 'g1' }).map((d, i) => ({ ...d, id: `r${i}` }))
    const txs = [...base, ...docs]
    expect(saldoCaixinha(txs, 'g1')).toBe(6000 - 700)
    expect(calcSaldo(txs, '2020-01-01', HOJE)).toBe(-6000 + 700)
  })
})
