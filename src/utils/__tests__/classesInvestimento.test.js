import { describe, it, expect } from 'vitest'
import { CLASSES_INVESTIMENTO, CLASSE_POR_ID, agruparAportes, atualizacoesDeClasse } from '../classesInvestimento'

/** Reclassificar aportes por descrição. Hoje = 19/11/2026. */
const HOJE = '2026-11-19'
const ap = (id, descricao, valor, dataInicio, extra = {}) => ({ id, tipo: 'investimento', descricao, valor, dataInicio, frequencia: 'unico', ...extra })

const lista = [
  ap('1', 'Tesouro Selic', 500, '2026-09-05'),
  ap('2', 'tesouro  selic', 500, '2026-10-05', { classeInvestimento: 'renda_fixa' }),
  ap('3', 'PETR4', 300, '2026-10-10'),
  ap('4', 'Aporte futuro', 900, '2026-12-01'),
  { id: '5', tipo: 'saida', descricao: 'Tesouro Selic', valor: 99, dataInicio: '2026-10-01', frequencia: 'unico' },
]

describe('agruparAportes', () => {
  it('agrupa por descrição ignorando caixa, acento e espaços; só aportes (investimento)', () => {
    const g = agruparAportes(lista, HOJE)
    const tesouro = g.find(x => x.chave === 'tesouro selic')
    expect(tesouro).toMatchObject({ quantidade: 2, total: 1000, ids: ['1', '2'] })
    expect(tesouro.classes.sort()).toEqual(['', 'renda_fixa'])
    expect(g.some(x => x.ids.includes('5'))).toBe(false)
  })

  it('o total conta só até hoje (aporte futuro fica com 0) e ordena pelo maior', () => {
    const g = agruparAportes(lista, HOJE)
    expect(g.find(x => x.chave === 'aporte futuro').total).toBe(0)
    expect(g.map(x => x.chave)).toEqual(['tesouro selic', 'petr4', 'aporte futuro'])
  })

  it('aporte recorrente é um lançamento só e soma as ocorrências até hoje', () => {
    const rec = [ap('r', 'Caixinha mensal', 100, '2026-09-01', { frequencia: 'mensal' })]
    const [g] = agruparAportes(rec, HOJE)
    expect(g.quantidade).toBe(1)
    expect(g.total).toBe(300) // set, out, nov
  })

  it('soSemClasse esconde grupos totalmente classificados', () => {
    const l = [ap('a', 'Ações X', 100, '2026-10-01', { classeInvestimento: 'acoes' }), ap('b', 'Sem classe', 100, '2026-10-01')]
    expect(agruparAportes(l, HOJE, { soSemClasse: true }).map(x => x.chave)).toEqual(['sem classe'])
  })
})

describe('atualizacoesDeClasse', () => {
  it('uma atualização por aporte do grupo, só com o campo classeInvestimento', () => {
    const [g] = agruparAportes(lista, HOJE)
    expect(atualizacoesDeClasse(g, 'caixinha')).toEqual([
      { id: '1', data: { classeInvestimento: 'caixinha' } },
      { id: '2', data: { classeInvestimento: 'caixinha' } },
    ])
  })

  it('classe vazia remove a classe', () => {
    const [g] = agruparAportes(lista, HOJE)
    expect(atualizacoesDeClasse(g, '')[0].data).toEqual({ classeInvestimento: null })
  })
})

describe('classes', () => {
  it('inclui a caixinha de resgate imediato e todas têm cor e liquidez', () => {
    expect(CLASSE_POR_ID.caixinha.liquidez).toBe('imediata')
    for (const c of CLASSES_INVESTIMENTO) { expect(c.cor).toMatch(/^#/); expect(c.liquidez).toBeTruthy() }
    expect(CLASSES_INVESTIMENTO.map(c => c.id)).toEqual(expect.arrayContaining(['acoes', 'fiis', 'renda_fixa', 'cripto', 'internacional', 'outro']))
  })
})
