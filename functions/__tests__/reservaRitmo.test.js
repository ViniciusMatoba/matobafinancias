import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createRequire } from 'node:module'
import {
  bot, fake, UID, CHAT, fixarRelogio, instalarTelegramFalso, enviarAoBot, mensagemTelegram, mensagensEnviadas,
} from './helpers'
import { ritmoDaReserva, projecaoReserva, rotuloMes } from '../../src/utils/reservaRitmo'

const require = createRequire(import.meta.url)
const { ritmoDaReservaBot, projecaoReservaBot, rotuloMes: rotuloBot } = require('../lib/motor/reservaRitmo')

/**
 * Projeção da reserva no ritmo real: paridade app × bot e as linhas no /reserva e no relatório N23.
 * Hoje = 14/10/2026 (meses completos: jul, ago, set).
 */
fixarRelogio()
const HOJE = '2026-10-14'

// ── paridade ──────────────────────────────────────────────────────────────────
let semente = 5150
const rnd = () => (semente = (semente * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
const pick = (a) => a[Math.floor(rnd() * a.length)]

function gerar() {
  const txs = []
  const n = Math.floor(rnd() * 8)
  for (let i = 0; i < n; i++) {
    txs.push({
      id: `t${i}`,
      tipo: pick(['investimento', 'investimento', 'entrada', 'saida']),
      frequencia: pick(['unico', 'unico', 'mensal', 'semanal']),
      dataInicio: pick(['2026-05-10', '2026-07-03', '2026-08-20', '2026-09-09', '2026-10-02', '2025-12-01']),
      valor: pick([50, 300, 750, 1500, 4000]),
      metaId: pick(['g1', 'g1', 'g1', 'g2', undefined]),
      ...(rnd() < 0.15 ? { exclusoes: [pick(['2026-08-10', '2026-09-10'])] } : {}),
      ...(rnd() < 0.1 ? { dataFim: '2026-08-31' } : {}),
    })
  }
  return txs
}

describe('paridade app × bot', () => {
  it('rotuloMes é igual nos dois lados', () => {
    for (const m of ['2026-01', '2026-08', '2027-12']) expect(rotuloBot(m)).toBe(rotuloMes(m))
  })

  it('300 cenários dão o mesmo ritmo e a mesma projeção', () => {
    let comRitmo = 0, semRitmo = 0, longos = 0
    for (let k = 0; k < 300; k++) {
      const txs = gerar()
      const app = ritmoDaReserva({ transactions: txs, goalId: 'g1', hoje: HOJE })
      const b = ritmoDaReservaBot({ transactions: txs, goalId: 'g1', hoje: HOJE })
      expect(JSON.stringify(b), `ritmo ${k}`).toBe(JSON.stringify(app))
      const falta = pick([0, 100, 5000, 18000, 400000])
      const pApp = projecaoReserva({ falta, ritmoMensal: app.ritmoMensal, hoje: HOJE })
      const pBot = projecaoReservaBot({ falta, ritmoMensal: b.ritmoMensal, hoje: HOJE })
      expect(JSON.stringify(pBot), `projeção ${k}`).toBe(JSON.stringify(pApp))
      if (app.ritmoMensal > 0) comRitmo++; else semRitmo++
      if (pApp.maisDeDezAnos) longos++
    }
    expect(comRitmo).toBeGreaterThan(50)
    expect(semRitmo).toBeGreaterThan(20)
    expect(longos).toBeGreaterThan(0)
  })
})

// ── /reserva e N23 ────────────────────────────────────────────────────────────
const CONFIG = { investimentos: { perfil: 'clt', mesesMeta: 6, despesasMens: 3000, reservaGoalId: 'g1' } } // meta R$ 18.000
const aporte = (id, valor, data, extra = {}) => ({ id, tipo: 'investimento', frequencia: 'unico', dataInicio: data, valor, descricao: 'Aporte', metaId: 'g1', ...extra })

function semear(txs, config = CONFIG) {
  fake.seed(`users/${UID}`, { telegramChatId: String(CHAT) })
  fake.seed(`config/${UID}`, config)
  fake.seed('goals/g1', { userId: UID, nome: 'Reserva', metaFinal: 18000 })
  txs.forEach(t => fake.seed(`transactions/${UID}/entries/${t.id}`, t))
}
const reserva = async () => { await enviarAoBot(mensagemTelegram('/reserva')); return mensagensEnviadas().join('\n') }

describe('/reserva no Telegram', () => {
  beforeEach(() => { fake.limpar(); instalarTelegramFalso() })

  it('mostra quanto falta e a projeção no ritmo real', async () => {
    semear([aporte('a1', 1500, '2026-08-10'), aporte('a2', 1500, '2026-09-10')])
    const t = await reserva()
    expect(t).toContain('Falta *R$ 15.000,00*')
    expect(t).toContain('No seu ritmo (R$ 1.500,00/mês)')
    expect(t).toContain('completa em 10 meses (ago/2027)')
  })

  it('com um único mês de histórico avisa que a base é pequena', async () => {
    semear([aporte('a1', 1000, '2026-09-10')])
    expect(await reserva()).toContain('só 1 mês de histórico')
  })

  it('sem aportes recentes explica que não dá para projetar', async () => {
    semear([aporte('a1', 1000, '2026-03-10')])
    expect(await reserva()).toContain('Sem aportes na reserva nos últimos meses')
  })

  it('ritmo muito baixo vira "mais de 10 anos"', async () => {
    semear([aporte('a1', 100, '2026-08-10'), aporte('a2', 100, '2026-09-10')])
    expect(await reserva()).toContain('mais de 10 anos')
  })

  it('falta pouco: fala "1 mês" no singular', async () => {
    // reserva = 17.000 (15.000 antigos + 2 × 1.000); falta 1.000 no ritmo de 1.000/mês
    semear([aporte('a0', 15000, '2026-03-10'), aporte('a1', 1000, '2026-08-10'), aporte('a2', 1000, '2026-09-10')])
    expect(await reserva()).toContain('completa em 1 mês (nov/2026)')
  })

  it('reserva completa não mostra projeção', async () => {
    semear([aporte('a1', 18000, '2026-09-10')])
    const t = await reserva()
    expect(t).toContain('Reserva completa')
    expect(t).not.toContain('No seu ritmo')
  })

  it('só lê: não grava nada', async () => {
    semear([aporte('a1', 1500, '2026-09-10')])
    const antes = JSON.stringify(fake.lista(`transactions/${UID}/entries`))
    await reserva()
    expect(JSON.stringify(fake.lista(`transactions/${UID}/entries`))).toBe(antes)
  })
})
