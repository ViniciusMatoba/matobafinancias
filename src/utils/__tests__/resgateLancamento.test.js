import { describe, it, expect } from 'vitest'
import { docDeResgate, opcoesDeOrigem, origemInicial, origemDe } from '../classesInvestimento'
import { ehResgate, tipoDoTx, totalInvestidoAte } from '../investido'
import { saldoCaixinha } from '../caixinha'
import { calcSaldo } from '../projectionCalc'
import { TYPE_CONFIG } from '../formatters'

/** Tipo "Resgate" do formulário de lançamentos. Hoje = 03/11/2026. */
const HOJE = '2026-11-03'
const tx = (id, tipo, valor, dataInicio, extra = {}) => ({ id, tipo, valor, dataInicio, frequencia: 'unico', descricao: id, ...extra })
const goals = [{ id: 'g1', nome: 'Reserva de emergência' }]
const carteira = [
  tx('res', 'investimento', 3000, '2026-09-01', { metaId: 'g1' }),
  tx('acao', 'investimento', 2000, '2026-09-05', { classeInvestimento: 'acoes' }),
  tx('rf', 'investimento', 1000, '2026-09-06', { classeInvestimento: 'renda_fixa' }),
]

describe('docDeResgate', () => {
  it('reserva: entrada marcada, com metaId da caixinha e sem classe', () => {
    const d = docDeResgate({ valor: 500, data: HOJE, hoje: HOJE, origem: 'reserva', reservaGoalId: 'g1' })
    expect(d).toMatchObject({ tipo: 'entrada', resgate: true, frequencia: 'unico', valor: 500, dataInicio: HOJE, metaId: 'g1', classeInvestimento: null, conferido: true, descricao: 'Resgate de Reserva' })
    expect(ehResgate(d)).toBe(true)
  })

  it('classe: leva a classe e metaId null (grava os dois campos para a edição trocar de origem)', () => {
    const d = docDeResgate({ valor: 300, data: '2026-11-10', hoje: HOJE, origem: 'acoes', reservaGoalId: 'g1', descricao: 'Vendi PETR4' })
    expect(d).toMatchObject({ metaId: null, classeInvestimento: 'acoes', descricao: 'Vendi PETR4', conferido: false })
  })

  it('conferido explícito vence a regra da data', () => {
    expect(docDeResgate({ valor: 1, data: '2026-11-10', hoje: HOJE, origem: 'outro', conferido: true }).conferido).toBe(true)
  })

  it('"reserva" sem caixinha escolhida vira classe "outro"', () => {
    expect(docDeResgate({ valor: 1, data: HOJE, hoje: HOJE, origem: 'reserva', reservaGoalId: null }).classeInvestimento).toBe('outro')
  })

  it('origemDe devolve a origem de um resgate gravado (para a edição)', () => {
    const r = docDeResgate({ valor: 1, data: HOJE, hoje: HOJE, origem: 'reserva', reservaGoalId: 'g1' })
    const c = docDeResgate({ valor: 1, data: HOJE, hoje: HOJE, origem: 'fiis', reservaGoalId: 'g1' })
    expect(origemDe(r, 'g1')).toBe('reserva')
    expect(origemDe(c, 'g1')).toBe('fiis')
  })
})

describe('opcoesDeOrigem / origemInicial', () => {
  it('lista a reserva (se escolhida) e as classes, com o disponível de cada uma', () => {
    const o = opcoesDeOrigem({ transactions: carteira, ate: HOJE, reservaGoalId: 'g1', goals })
    expect(o.map(x => x.id)).toEqual(['reserva', 'caixinha', 'renda_fixa', 'outro', 'acoes', 'fiis', 'internacional', 'cripto'])
    expect(Object.fromEntries(o.map(x => [x.id, x.disponivel]))).toMatchObject({ reserva: 3000, renda_fixa: 1000, acoes: 2000, caixinha: 0 })
  })

  it('sem caixinha de reserva escolhida a opção "Reserva" não aparece', () => {
    expect(opcoesDeOrigem({ transactions: carteira, ate: HOJE, goals }).some(x => x.id === 'reserva')).toBe(false)
  })

  it('a origem sugerida é a primeira com saldo; sem saldo nenhum, "outro"', () => {
    expect(origemInicial(opcoesDeOrigem({ transactions: carteira, ate: HOJE, reservaGoalId: 'g1', goals }))).toBe('reserva')
    expect(origemInicial(opcoesDeOrigem({ transactions: [], ate: HOJE, goals }))).toBe('outro')
  })

  it('ao editar, o próprio resgate não conta no disponível', () => {
    const rg = { ...docDeResgate({ valor: 1000, data: '2026-10-01', hoje: HOJE, origem: 'acoes' }), id: 'rg' }
    const sem = opcoesDeOrigem({ transactions: [...carteira, rg], ate: HOJE, goals })
    const com = opcoesDeOrigem({ transactions: [...carteira, rg], ate: HOJE, goals, ignorarId: 'rg' })
    expect(sem.find(x => x.id === 'acoes').disponivel).toBe(1000)
    expect(com.find(x => x.id === 'acoes').disponivel).toBe(2000)
  })
})

describe('efeito do resgate lançado pelo formulário', () => {
  it('conta sobe, investido e caixinha caem; total (conta + investido) não muda', () => {
    const base = [tx('sal', 'entrada', 8000, '2026-09-01'), ...carteira]
    const antes = { conta: calcSaldo(base, '2020-01-01', HOJE), inv: totalInvestidoAte(base, HOJE) }
    const rg = { ...docDeResgate({ valor: 700, data: HOJE, hoje: HOJE, origem: 'reserva', reservaGoalId: 'g1' }), id: 'rg' }
    const l = [...base, rg]
    expect(calcSaldo(l, '2020-01-01', HOJE)).toBe(antes.conta + 700)
    expect(totalInvestidoAte(l, HOJE)).toBe(antes.inv - 700)
    expect(saldoCaixinha(l, 'g1')).toBe(3000 - 700)
  })
})

describe('exibição', () => {
  it('tipoDoTx separa o resgate das entradas comuns e o TYPE_CONFIG tem o rótulo', () => {
    const rg = docDeResgate({ valor: 1, data: HOJE, hoje: HOJE, origem: 'outro' })
    expect(tipoDoTx(rg)).toBe('resgate')
    expect(tipoDoTx(tx('e', 'entrada', 1, HOJE))).toBe('entrada')
    expect(tipoDoTx(tx('i', 'investimento', 1, HOJE))).toBe('investimento')
    expect(TYPE_CONFIG.resgate).toMatchObject({ label: 'Resgate', sign: 1 })
  })
})
