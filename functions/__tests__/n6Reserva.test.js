import { describe, it, expect } from 'vitest'
import { bot, fixarRelogio } from './helpers'

/** N6 — saldo negativo: avisa se a reserva de emergência cobre o buraco. Hoje = 14/10/2026. */
fixarRelogio()

const TODOS = Array.from({ length: 27 }, (_, i) => `n${i + 1}`)
const so = (...l) => Object.fromEntries(TODOS.map(n => [n, l.includes(n)]))
const texto = (m) => String(typeof m === 'string' ? m : m.text).replace(/[  ]/g, ' ')

const saida = { id: 's1', tipo: 'saida', frequencia: 'unico', dataInicio: '2026-10-10', valor: 1000, descricao: 'Conta' }
const aporteReserva = { id: 'a1', tipo: 'investimento', frequencia: 'unico', dataInicio: '2026-09-01', valor: 5000, descricao: 'Reserva', metaId: 'g1' }
const goals = [{ id: 'g1', nome: 'Reserva de emergência', metaFinal: 20000 }]
const roda = (txs, config) => bot.checkNotifications([], txs, config, { tipos: so('n6') }, goals, 0).map(texto)

describe('N6 com reserva', () => {
  it('reserva cobre o negativo: o aviso diz isso', () => {
    const salario = { id: 'e1', tipo: 'entrada', frequencia: 'unico', dataInicio: '2026-09-01', valor: 5500, descricao: 'Salário' }
    const [t] = roda([salario, saida, aporteReserva], { investimentos: { reservaGoalId: 'g1' } }) // saldo −500
    expect(t).toContain('Saldo atual negativo')
    expect(t).toContain('A reserva (R$ 5.000,00) cobre esse valor')
  })

  it('reserva não cobre: mostra quanto falta', () => {
    const grande = { ...saida, valor: 9000 }
    const [t] = roda([grande, aporteReserva], { investimentos: { reservaGoalId: 'g1' } })
    expect(t).toContain('Mesmo com o que você tem guardado (R$ 5.000,00) faltam')
  })

  it('sem caixinha de reserva, o total investido cobre (caso real: negativo pequeno, R$ 3.000 investidos)', () => {
    const salario = { id: 'e1', tipo: 'entrada', frequencia: 'unico', dataInicio: '2026-09-01', valor: 3300, descricao: 'Salário' }
    const aporte = { id: 'a2', tipo: 'investimento', frequencia: 'unico', dataInicio: '2026-09-02', valor: 3000, descricao: 'Aporte' }
    const [t] = roda([salario, aporte, { ...saida, valor: 600 }], {}) // saldo −300
    expect(t).toContain('Saldo atual negativo')
    expect(t).toContain('investido (R$ 3.000,00) cobre esse valor')
  })

  it('sem reserva configurada o texto não muda', () => {
    const [t] = roda([saida], {})
    expect(t).toContain('Saldo atual negativo')
    expect(t).not.toContain('reserva')
  })
})
