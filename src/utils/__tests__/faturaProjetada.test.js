import { describe, it, expect } from 'vitest'
import { calcSaldo, expandOccurrences } from '../projectionCalc'
import { expandDespesas } from '../despesas'
import {
  docPagamentoFaturaProjetada, itensDoLancamentoReal, encontrarDuplicidades, correcaoPagamentosRedundantes,
} from '../faturaProjetada'

/**
 * Fluxos do app que viram faturas projetadas em lançamentos reais (pagar, editar "esta e as futuras") não podem
 * duplicar parcelas. Compra: Mercado à vista R$100 + TV 4x de R$200 → total esperado R$ 900 em qualquer fluxo.
 */

const TV = (k, extra = {}) => ({
  descricao: 'TV', valor: 200, categoria: 'conforto', dataCompra: '2026-09-20',
  isParcelado: true, parcelaAtual: k, totalParcelas: 4, ...extra,
})
const origem = {
  id: 'f1', tipo: 'cartao', frequencia: 'unico', cartaoId: 'c1', descricao: 'Fatura', dataInicio: '2026-10-10', valor: 300,
  itens: [{ descricao: 'Mercado', valor: 100, categoria: 'custos_fixos', dataCompra: '2026-09-28' }, TV(1)],
}
const ATE = '2027-01-31'
const caixa = (txs) => calcSaldo(txs, '2026-01-01', ATE) // negativo = saídas
const gastos = (txs) => expandDespesas(txs, '2026-09-01', ATE).reduce((s, e) => s + e.valor, 0)
const projecaoDeNovembro = () => expandOccurrences(origem, '2026-11-01', '2026-11-30')[0].tx // o que a tela da Projeção mostra

describe('pagar uma fatura projetada (app e bot usam o mesmo desenho de lançamento)', () => {
  const pai = { ...origem, exclusoes: ['2026-11-10'] }
  const pago = { id: 'p', ...docPagamentoFaturaProjetada(projecaoDeNovembro(), { paymentDate: '2026-11-12', valor: 200 }) }

  it('o lançamento de pagamento não projeta parcelas de novo: caixa e gastos ficam em R$ 900', () => {
    expect(caixa([pai, pago])).toBe(-900)
    expect(gastos([pai, pago])).toBe(900)
  })

  it('guarda o valor, a data, o cartão e a parcela paga; os itens ficam sem projeção própria', () => {
    expect(pago).toMatchObject({ valor: 200, dataInicio: '2026-11-12', cartaoId: 'c1', conferido: true, frequencia: 'unico' })
    expect(pago.descricao).toContain('Pagamento Fatura')
    expect(pago.itens).toEqual([expect.objectContaining({ descricao: 'TV', parcelaAtual: 2, totalParcelas: 4, isParcelado: false })])
  })

  it('não há duplicidade a reportar', () => {
    const r = encontrarDuplicidades([pai, pago])
    expect(r.parcelasEmDobro).toEqual([])
    expect(r.pagamentosRedundantes).toEqual([])
  })
})

describe('"Esta e todas as futuras" numa fatura projetada (pai ganha dataFim, novo lançamento continua)', () => {
  const pai = { ...origem, dataFim: '2026-11-09' }
  const novo = { id: 'n', tipo: 'cartao', frequencia: 'unico', cartaoId: 'c1', descricao: 'Fatura', dataInicio: '2026-11-10', dataFim: null, valor: 200, itens: [TV(2)] }

  it('o pai para de projetar na dataFim: caixa e gastos em R$ 900', () => {
    expect(caixa([pai, novo])).toBe(-900)
    expect(gastos([pai, novo])).toBe(900)
  })

  it('sem nenhuma duplicidade', () => {
    expect(encontrarDuplicidades([pai, novo]).parcelasEmDobro).toEqual([])
  })
})

describe('dados antigos gravados pelo defeito anterior', () => {
  // o app antigo gravava o pagamento com os itens ainda parcelados
  const pai = { ...origem, exclusoes: ['2026-11-10'] }
  const pagoAntigo = {
    id: 'p', tipo: 'cartao', frequencia: 'unico', cartaoId: 'c1', descricao: 'Pagamento Fatura – Fatura (Parcelas restantes)',
    dataInicio: '2026-11-12', valor: 200, conferido: true, itens: [TV(2)],
  }

  it('o caixa soma parcelas em dobro (era o defeito)', () => {
    expect(caixa([pai, pagoAntigo])).toBe(-1300)
  })

  it('a verificação acha o pagamento redundante e as parcelas em dobro', () => {
    const r = encontrarDuplicidades([pai, pagoAntigo])
    expect(r.pagamentosRedundantes.map(t => t.id)).toEqual(['p'])
    expect(r.parcelasEmDobro.map(p => p.parcela)).toEqual(['3/4', '4/4'])
    expect(r.parcelasEmDobro.reduce((s, p) => s + p.excedente, 0)).toBe(400)
  })

  it('a correção automática zera as duplicidades e deixa o caixa em R$ 900', () => {
    const { pagamentosRedundantes } = encontrarDuplicidades([pai, pagoAntigo])
    const updates = correcaoPagamentosRedundantes(pagamentosRedundantes)
    expect(updates).toHaveLength(1)
    expect(Object.keys(updates[0].data)).toEqual(['itens']) // só mexe nos itens
    const corrigido = { ...pagoAntigo, ...updates[0].data }
    expect(caixa([pai, corrigido])).toBe(-900)
    expect(gastos([pai, corrigido])).toBe(900)
    const depois = encontrarDuplicidades([pai, corrigido])
    expect(depois.parcelasEmDobro).toEqual([])
    expect(depois.pagamentosRedundantes).toEqual([])
  })

  it('não corrige pagamento cujo lançamento de origem não existe mais (seria perder as parcelas)', () => {
    expect(encontrarDuplicidades([pagoAntigo]).pagamentosRedundantes).toEqual([])
  })

  it('dados do "Esta e todas as futuras" antigo (pai com dataFim) já ficam certos só pelo cálculo', () => {
    const paiAntigo = { ...origem, dataFim: '2026-11-09' }
    const novo = { id: 'n', tipo: 'cartao', frequencia: 'unico', cartaoId: 'c1', descricao: 'Fatura', dataInicio: '2026-11-10', valor: 200, itens: [TV(2)] }
    expect(caixa([paiAntigo, novo])).toBe(-900)
  })
})

describe('duplicidades que dependem de decisão do usuário', () => {
  it('fatura nova lançada sem excluir a projeção do original: parcela em dobro, sem correção automática', () => {
    const nova = { id: 'f2', tipo: 'cartao', frequencia: 'unico', cartaoId: 'c1', descricao: 'Fatura', dataInicio: '2026-11-10', valor: 300, itens: [TV(2)] }
    const r = encontrarDuplicidades([origem, nova])
    expect(r.parcelasEmDobro.map(p => p.parcela)).toEqual(['2/4', '3/4', '4/4'])
    expect(r.pagamentosRedundantes).toEqual([])
  })

  it('faturas idênticas (cartão, data, valor e descrição) são reportadas; valores diferentes não', () => {
    const a = { id: 'a', tipo: 'cartao', frequencia: 'unico', cartaoId: 'c1', descricao: 'Fatura', dataInicio: '2026-10-10', valor: 500 }
    const b = { ...a, id: 'b' }
    expect(encontrarDuplicidades([a, b]).faturasRepetidas).toEqual([expect.objectContaining({ valor: 500, docIds: ['a', 'b'] })])
    expect(encontrarDuplicidades([a, { ...b, valor: 501 }]).faturasRepetidas).toEqual([])
  })

  it('uma fatura normal, sem edição, não tem nada a reportar', () => {
    expect(encontrarDuplicidades([origem])).toEqual({ parcelasEmDobro: [], pagamentosRedundantes: [], faturasRepetidas: [] })
  })
})

describe('itensDoLancamentoReal', () => {
  it('não altera os itens originais', () => {
    const itens = [TV(2)]
    const novos = itensDoLancamentoReal(itens)
    expect(novos[0].isParcelado).toBe(false)
    expect(itens[0].isParcelado).toBe(true)
  })
})
