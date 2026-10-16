import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { bot, fixarRelogio } from './helpers'
import { ehResgate, sinalNaCaixinha, totalInvestidoAte } from '../../src/utils/investido'
import { saldoCaixinha, reservaDaCaixinha } from '../../src/utils/caixinha'
import { calcSaldo } from '../../src/utils/projectionCalc'

const require = createRequire(import.meta.url)
const B = require('../lib/motor/investido')
const { saldoCaixinhaBot } = require('../lib/motor/caixinha')
const { calcSaldoSimples } = require('../lib/motor/caixa')

/** Resgate = ENTRADA com resgate:true. Hoje = 14/10/2026. */
fixarRelogio()
const HOJE = '2026-10-14'
const tx = (id, tipo, valor, dataInicio, extra = {}) => ({ id, tipo, valor, dataInicio, frequencia: 'unico', descricao: id, ...extra })

const lista = [
  tx('sal', 'entrada', 5000, '2026-10-01'),
  tx('ap1', 'investimento', 3000, '2026-10-02', { metaId: 'g1' }),
  tx('ap2', 'investimento', 1000, '2026-10-03'),
  tx('rg1', 'entrada', 800, '2026-10-10', { resgate: true, metaId: 'g1' }),
  tx('rg-futuro', 'entrada', 500, '2026-10-20', { resgate: true }),
]
const goals = [{ id: 'g1', nome: 'Reserva de emergência' }]

describe('resgate — app', () => {
  it('só entrada com resgate:true é resgate', () => {
    expect(ehResgate(lista[3])).toBe(true)
    expect(ehResgate(lista[0])).toBe(false)
    expect(ehResgate({ tipo: 'saida', resgate: true })).toBe(false)
    expect(ehResgate(null)).toBe(false)
  })

  it('total investido = aportes − resgates até a data (resgate futuro ainda não conta)', () => {
    expect(totalInvestidoAte(lista, HOJE)).toBe(3000 + 1000 - 800)
    expect(totalInvestidoAte(lista, '2026-10-20')).toBe(3000 + 1000 - 800 - 500)
  })

  it('o saldo da caixinha desconta o resgate; reserva nunca negativa', () => {
    expect(saldoCaixinha(lista, 'g1')).toBe(3000 - 800)
    expect(sinalNaCaixinha(lista[3])).toBe(-1)
    expect(reservaDaCaixinha([tx('r', 'entrada', 900, HOJE, { resgate: true, metaId: 'g1' })], goals, 'g1')).toBe(0)
  })

  it('no caixa o resgate é entrada: o dinheiro volta para a conta', () => {
    expect(calcSaldo(lista, '2020-01-01', HOJE)).toBe(5000 - 3000 - 1000 + 800)
  })
})

describe('resgate — bot (paridade com o app)', () => {
  it('mesmos números do app', () => {
    expect(B.totalInvestidoAteBot(lista, HOJE)).toBe(totalInvestidoAte(lista, HOJE))
    expect(B.totalInvestidoAteBot(lista, '2026-10-20')).toBe(totalInvestidoAte(lista, '2026-10-20'))
    expect(saldoCaixinhaBot(lista, 'g1')).toBe(saldoCaixinha(lista, 'g1'))
    expect(calcSaldoSimples(lista, HOJE, 0)).toBe(calcSaldo(lista, '2020-01-01', HOJE))
  })

  it('ehResgateBot e sinalNaCaixinhaBot', () => {
    expect(B.ehResgateBot(lista[3])).toBe(true)
    expect(B.ehResgateBot(lista[0])).toBe(false)
    expect(B.sinalNaCaixinhaBot(lista[3])).toBe(-1)
    expect(B.sinalNaCaixinhaBot(lista[1])).toBe(1)
  })

  it('o N6 usa aportes − resgates como "investido"', () => {
    const TODOS = Array.from({ length: 27 }, (_, i) => `n${i + 1}`)
    const so6 = Object.fromEntries(TODOS.map(n => [n, n === 'n6']))
    const txs = [tx('ap', 'investimento', 3000, '2026-10-02'), tx('rg', 'entrada', 2800, '2026-10-05', { resgate: true }), tx('c', 'saida', 500, '2026-10-10')]
    // saldo = −3000 + 2800 − 500 = −700; investido = 200 → não cobre
    const t = bot.checkNotifications([], txs, {}, { tipos: so6 }, [], 0).map(m => String(m.text).replace(/[  ]/g, ' ')).join('\n')
    expect(t).toContain('faltam R$ 500,00')
  })
})
