import { describe, it, expect } from 'vitest'
import { bot, fixarRelogio } from './helpers'

/**
 * N23 — relatório de investimentos e reserva (dias 15 e 30). Mensagens saem como texto puro (sem estado):
 * só disparam duas vezes por mês, então não precisam de memória de avisos.
 */

const TODOS = Array.from({ length: 25 }, (_, i) => `n${i + 1}`)
const prefs = (...ligados) => ({ tipos: Object.fromEntries(TODOS.map(n => [n, ligados.includes(n)])) })
const roda = ({ txs = [], config = {}, goals = [], wallet = 0, alertas = ['n23'] } = {}) =>
  bot.checkNotifications([], txs, config, prefs(...alertas), goals, wallet)
    .map(m => String(typeof m === 'string' ? m : m.text).replace(/[  ]/g, ' '))

let seq = 0
const entrada = (valor, extra = {}) => ({
  id: `e${++seq}`, tipo: 'entrada', frequencia: 'unico', dataInicio: '2026-10-01', descricao: 'Salário', valor, ...extra,
})
const investimento = (valor, extra = {}) => ({
  id: `i${++seq}`, tipo: 'investimento', frequencia: 'unico', dataInicio: '2026-10-02', descricao: 'Aporte', valor, ...extra,
})

const PERFIL = { investimentos: { perfil: 'clt', mesesMeta: 6, despesasMens: 3000, reservaGoalId: 'g1' } } // meta: R$ 18.000
const GOAL = { id: 'g1', nome: 'Reserva', saldoInicial: 0 }

describe('N23 — dia 15', () => {
  fixarRelogio('2026-10-15T15:00:00Z')

  it('sem perfil configurado: lembrete motivacional', () => {
    const [m] = roda()
    expect(m).toContain('Lembrete de Investimento — Dia 15')
    expect(m).toContain('ainda não configurou sua reserva')
    expect(m).toContain('aba Investir')
  })

  it('opção n23 desligada: não manda nada', () => {
    expect(roda({ alertas: [] })).toHaveLength(0)
  })

  it('com perfil: cabeçalho com dia e mês por extenso', () => {
    const [m] = roda({ config: PERFIL, goals: [GOAL], txs: [entrada(5000)] })
    expect(m).toContain('Relatório de Investimentos — Dia 15 de Outubro')
  })

  it('reserva incompleta: percentual, barra, quanto falta e divisão 60/40 da sobra', () => {
    const [m] = roda({ config: PERFIL, goals: [GOAL], txs: [entrada(6000, { goalId: 'g1' })] })
    expect(m).toContain('33%')
    expect(m).toContain('R$ 6.000,00 de R$ 18.000,00')
    expect(m).toContain('Falta: *R$ 12.000,00*')
    expect(m).toContain('Sobra disponível para aportar*: *R$ 6.000,00*')
    expect(m).toContain('Reserva (60%): R$ 3.600,00')
    expect(m).toContain('Investimento (40%): R$ 2.400,00')
  })

  it('reserva completa: parabéns e 100% livre para investir', () => {
    const [m] = roda({ config: PERFIL, goals: [GOAL], txs: [entrada(18000, { goalId: 'g1' })] })
    expect(m).toContain('100%')
    expect(m).toContain('Reserva completa')
    expect(m).toContain('100% livre para investir')
    expect(m).not.toContain('Reserva (60%)')
  })

  it('perfil sem meta de meses: não mostra bloco da reserva, mostra a sobra inteira para investir', () => {
    const cfg = { investimentos: { perfil: 'clt', mesesMeta: 0, despesasMens: 0 } }
    const [m] = roda({ config: cfg, txs: [entrada(3000)] })
    expect(m).not.toContain('Reserva de Emergência')
    expect(m).toContain('R$ 3.000,00')
    expect(m).toContain('100% livre para investir')
  })

  it('mostra o total já investido', () => {
    const [m] = roda({ config: PERFIL, goals: [GOAL], txs: [entrada(5000), investimento(1000)] })
    expect(m).toContain('Total Investido*: R$ 1.000,00')
  })

  it('sobra abaixo de R$ 200: avisa o motivo e aponta a próxima janela', () => {
    const [m] = roda({ config: PERFIL, goals: [GOAL], txs: [entrada(150), entrada(5000, { dataInicio: '2026-10-25' })] })
    expect(m).toContain('Sem sobra segura para aportar hoje')
    expect(m).toContain('R$ 200,00')
    expect(m).toContain('A partir de 25/10')
    expect(m).not.toContain('Sobra disponível para aportar')
  })

  it('saldo negativo: sem sobra, sem divisão', () => {
    const [m] = roda({ config: PERFIL, goals: [GOAL], txs: [{ ...entrada(100) , tipo: 'saida' }] })
    expect(m).toContain('Sem sobra segura')
    expect(m).not.toContain('Reserva (60%)')
  })

  it('rodapé aponta para o app', () => {
    const [m] = roda({ config: PERFIL, goals: [GOAL], txs: [entrada(1000)] })
    expect(m.trim().endsWith('_Acesse o app → aba Investir para acompanhar!_')).toBe(true)
  })

  it('só uma mensagem por execução', () => {
    expect(roda({ config: PERFIL, goals: [GOAL], txs: [entrada(5000)] })).toHaveLength(1)
  })
})

describe('N23 — dia 30', () => {
  fixarRelogio('2026-10-30T15:00:00Z')
  it('mesmo relatório, com o rótulo do fim do mês', () => {
    const [m] = roda({ config: PERFIL, goals: [GOAL], txs: [entrada(5000)] })
    expect(m).toContain('Dia 30 de Outubro')
  })
  it('sem perfil: lembrete do dia 30', () => {
    expect(roda()[0]).toContain('Dia 30')
  })
})

describe('N23 — dias sem relatório', () => {
  describe.each(['2026-10-14', '2026-10-16', '2026-10-29', '2026-10-31'])('%s', (dia) => {
    fixarRelogio(`${dia}T15:00:00Z`)
    it('não dispara', () => {
      expect(roda({ config: PERFIL, goals: [GOAL], txs: [entrada(5000)] })).toHaveLength(0)
    })
  })
})

describe('N23 — comportamentos atuais registrados (ver relatório da avaliação)', () => {
  describe('fevereiro', () => {
    fixarRelogio('2027-02-28T15:00:00Z')
    it('o relatório "do fim do mês" não sai em fevereiro (não existe dia 30)', () => {
      expect(roda({ config: PERFIL, goals: [GOAL], txs: [entrada(5000)] })).toHaveLength(0)
    })
  })

  describe('vínculo da reserva', () => {
    fixarRelogio('2026-10-15T15:00:00Z')
    const goalComSaldo = { ...GOAL, saldoInicial: 500 }

    it('aporte ligado à caixinha por goalId é contado como entrada na reserva', () => {
      const [m] = roda({ config: PERFIL, goals: [goalComSaldo], txs: [entrada(2000, { goalId: 'g1' })] })
      expect(m).toContain('R$ 2.000,00 de R$ 18.000,00')
    })

    // O app grava o vínculo do aporte em metaId (TransactionForm / tela Metas); o cálculo da reserva
    // (tela Investir e N23) procura goalId/cartaoVinculo. Por isso aportes feitos pelo app não contam.
    it('aporte gravado como o app grava (metaId) NÃO entra na reserva — cai no saldo inicial da meta', () => {
      const [m] = roda({ config: PERFIL, goals: [goalComSaldo], txs: [entrada(5000), investimento(6000, { metaId: 'g1' })] })
      expect(m).toContain('R$ 500,00 de R$ 18.000,00')
    })

    it('aporte tipo investimento ligado por goalId conta NEGATIVO e a reserva vira zero (sinal do caixa)', () => {
      const [m] = roda({ config: PERFIL, goals: [goalComSaldo], txs: [entrada(5000), investimento(6000, { goalId: 'g1' })] })
      expect(m).toContain('R$ 0,00 de R$ 18.000,00')
    })

    it('movimentações que somam exatamente zero voltam ao saldo inicial da meta', () => {
      const [m] = roda({
        config: PERFIL, goals: [goalComSaldo],
        txs: [entrada(5000), entrada(1000, { goalId: 'g1' }), investimento(1000, { goalId: 'g1' })],
      })
      expect(m).toContain('R$ 500,00 de R$ 18.000,00')
    })

    it('caixinha configurada mas inexistente: não mostra bloco da reserva', () => {
      const [m] = roda({ config: PERFIL, goals: [], txs: [entrada(5000)] })
      expect(m).not.toContain('Reserva de Emergência')
    })
  })
})
