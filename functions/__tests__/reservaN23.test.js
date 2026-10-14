import { describe, it, expect, vi } from 'vitest'
import { bot, fixarRelogio } from './helpers'

/** Relatório N23 (dia 15) com a projeção da reserva no ritmo real. */
fixarRelogio()

const CONFIG = { investimentos: { perfil: 'clt', mesesMeta: 6, despesasMens: 3000, reservaGoalId: 'g1' } } // meta R$ 18.000
const TODOS = Array.from({ length: 27 }, (_, i) => `n${i + 1}`)
const prefs = { tipos: Object.fromEntries(TODOS.map(n => [n, n === 'n23'])) }
const goals = [{ id: 'g1', nome: 'Reserva', metaFinal: 18000 }]
const salario = { id: 'sal', tipo: 'entrada', frequencia: 'unico', dataInicio: '2026-09-01', valor: 30000, descricao: 'Salário' }
const aporte = (id, valor, data) => ({ id, tipo: 'investimento', frequencia: 'unico', dataInicio: data, valor, descricao: 'Aporte', metaId: 'g1' })

// o N23 só dispara nos dias 15 e de fim de mês
const relatorio = (txs) => {
  vi.setSystemTime(new Date('2026-10-15T15:00:00Z'))
  return bot.checkNotifications([], [salario, ...txs], CONFIG, prefs, goals, 0)
    .map(m => String(m).replace(/[  ]/g, ' ')).join('\n')
}

describe('N23 com a projeção da reserva', () => {
  it('traz a linha de ritmo logo depois do "Falta"', () => {
    const t = relatorio([aporte('a1', 1500, '2026-08-10'), aporte('a2', 1500, '2026-09-10')])
    expect(t).toContain('Falta: *R$ 15.000,00*')
    expect(t.indexOf('Falta:')).toBeLessThan(t.indexOf('No seu ritmo'))
    expect(t).toContain('completa em 10 meses (ago/2027)')
  })

  it('sem aportes recentes diz que não dá para projetar', () => {
    expect(relatorio([])).toContain('Sem aportes na reserva nos últimos meses')
  })

  it('reserva completa não mostra a projeção', () => {
    const t = relatorio([aporte('a1', 18000, '2026-09-10')])
    expect(t).toContain('Reserva completa')
    expect(t).not.toContain('No seu ritmo')
  })

  it('o resto do relatório continua igual (cabeçalho, sobra e rodapé)', () => {
    const t = relatorio([aporte('a1', 1500, '2026-09-10')])
    expect(t).toContain('Relatório de Investimentos — Dia 15 de Outubro')
    expect(t).toContain('Reserva de Emergência')
    expect(t).toContain('aba Investir')
  })
})
