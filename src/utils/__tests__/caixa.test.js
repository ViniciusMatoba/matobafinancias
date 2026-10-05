import { describe, it, expect } from 'vitest'
import { calcSaldo, buildDailyProjection, expandOccurrences } from '../projectionCalc'

/**
 * Trava do CAIXA: saldo e projeção por data/valor da fatura. Estes números descrevem o comportamento
 * atual de propósito (inclusive pontos discutíveis) — a regra de despesas por competência (despesas.js)
 * não pode alterá-los. Se um destes testes quebrar, o caixa mudou.
 */

const mercado = (valor, dataCompra) => ({ descricao: 'Mercado', valor, categoria: 'custos_fixos', dataCompra })
const tv = (parcelaAtual, extra = {}) => ({
  descricao: 'TV', valor: 200, categoria: 'conforto', dataCompra: '2026-09-20',
  isParcelado: true, parcelaAtual, totalParcelas: 3, ...extra,
})
const fatura = (id, dataInicio, itens, extra = {}) => ({
  id, tipo: 'cartao', frequencia: 'unico', cartaoId: 'c1', descricao: 'Fatura', dataInicio,
  valor: itens.reduce((s, i) => s + i.valor, 0), itens, ...extra,
})

const f1 = fatura('f1', '2026-10-10', [mercado(100, '2026-09-28'), tv(1)])

describe('caixa — fatura vence em 10/10 (à vista R$100 + parcela 1/3 de R$200)', () => {
  it('saldo acumulado por data da fatura e das parcelas projetadas', () => {
    expect(calcSaldo([f1], '2026-01-01', '2026-09-30')).toBe(0)
    expect(calcSaldo([f1], '2026-01-01', '2026-10-31')).toBe(-300)
    expect(calcSaldo([f1], '2026-01-01', '2026-11-30')).toBe(-500)
    expect(calcSaldo([f1], '2026-01-01', '2026-12-31')).toBe(-700)
  })

  it('projeção diária: a saída cai na data da fatura, não na da compra', () => {
    const dias = buildDailyProjection([f1], '2026-09-25', '2026-12-31', 1000)
    const saldoEm = (d) => dias.find(x => x.date === d).saldo
    expect(saldoEm('2026-09-28')).toBe(1000) // dia da compra: nada saiu do caixa
    expect(saldoEm('2026-10-09')).toBe(1000)
    expect(saldoEm('2026-10-10')).toBe(700)
    expect(saldoEm('2026-11-10')).toBe(500)
    expect(saldoEm('2026-12-10')).toBe(300)
    expect(dias.at(-1).saldo).toBe(300)
  })
})

describe('caixa — a mesma fatura paga em 02/11 (o app move dataInicio para o pagamento)', () => {
  const paga = fatura('f1', '2026-11-02', f1.itens, { conferido: true })

  it('a saída vai para a data do pagamento e as parcelas seguintes acompanham', () => {
    expect(calcSaldo([paga], '2026-01-01', '2026-10-31')).toBe(0)
    expect(calcSaldo([paga], '2026-01-01', '2026-11-30')).toBe(-300)
    expect(calcSaldo([paga], '2026-01-01', '2026-12-31')).toBe(-500)
    expect(calcSaldo([paga], '2026-01-01', '2027-01-31')).toBe(-700)
  })
})

describe('caixa — fatura de novembro criada a partir da projeção (pai exclui 10/11; itens viram não parcelados)', () => {
  const pai = { ...f1, exclusoes: ['2026-11-10'] }
  const nov = fatura('f2', '2026-11-10', [mercado(100, '2026-10-25'), tv(2, { isParcelado: false })])

  it('não duplica novembro e a parcela 3/3 continua vindo do pai', () => {
    expect(calcSaldo([pai, nov], '2026-01-01', '2026-10-31')).toBe(-300)
    expect(calcSaldo([pai, nov], '2026-01-01', '2026-11-30')).toBe(-600)
    expect(calcSaldo([pai, nov], '2026-01-01', '2026-12-31')).toBe(-800)
  })
})

describe('caixa — "Esta e todas as futuras" numa fatura projetada (pai ganha dataFim; novo continua parcelado)', () => {
  const pai = { ...f1, dataFim: '2026-11-09' }
  const novo = fatura('f2', '2026-11-10', [mercado(100, '2026-10-25'), tv(2)])

  it('o pai para de projetar na dataFim e nada é contado em dobro', () => {
    // pai: só out 300; novo: nov 300 + dez 200 (parcela 3/3 projetada)
    expect(calcSaldo([pai, novo], '2026-01-01', '2026-10-31')).toBe(-300)
    expect(calcSaldo([pai, novo], '2026-01-01', '2026-11-30')).toBe(-600)
    expect(calcSaldo([pai, novo], '2026-01-01', '2026-12-31')).toBe(-800)
  })

  it('a dataFim só corta as projeções, nunca a fatura do próprio mês', () => {
    const cortado = { ...f1, dataFim: '2026-09-01' }
    expect(calcSaldo([cortado], '2026-01-01', '2026-12-31')).toBe(-300)
  })
})

describe('caixa — comportamento atual preservado: nova fatura lançada sem excluir a projeção do pai', () => {
  const nov = fatura('f2', '2026-11-10', [mercado(100, '2026-10-25'), tv(2)])

  it('o caixa soma as duas (conhecido; não é alterado por esta mudança)', () => {
    // f1: out 300 + nov 200 (proj) + dez 200 (proj); f2: nov 300 + dez 200 (proj)
    expect(calcSaldo([f1, nov], '2026-01-01', '2026-11-30')).toBe(-800)
    expect(calcSaldo([f1, nov], '2026-01-01', '2026-12-31')).toBe(-1200)
  })
})

describe('caixa — as ocorrências que o caixa usa continuam sendo as mesmas', () => {
  it('fatura única com parcelas gera a ocorrência real e uma projetada por mês restante', () => {
    const occs = expandOccurrences(f1, '2026-01-01', '2026-12-31')
    expect(occs.map(o => [o.date, o.valor, o.tx.id])).toEqual([
      ['2026-10-10', 300, 'f1'],
      ['2026-11-10', 200, 'f1-proj-1'],
      ['2026-12-10', 200, 'f1-proj-2'],
    ])
  })
})
