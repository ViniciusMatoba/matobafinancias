import { describe, it, expect, beforeEach } from 'vitest'
import {
  bot, fake, UID, fixarRelogio, instalarTelegramFalso, enviarAoBot, mensagemTelegram, ultimaMensagem,
  criarUsuario, lancamento,
} from './helpers'
import { saldoCaixinha, reservaDaCaixinha } from '../../src/utils/caixinha'

/**
 * Reserva de emergência = saldo da caixinha escolhida, igual ao da tela Metas. A tela Metas
 * (GoalsScreen.jsx) calcula: transactions.filter(t => t.metaId === g.id), saída subtrai, o resto soma.
 */
fixarRelogio()

// Cópia literal da conta da tela Metas, para o teste comparar com a função usada nas outras telas
const saldoDaTelaMetas = (transactions, goalId) =>
  transactions.filter(t => t.metaId === goalId).reduce((acc, t) => {
    if (t.tipo === 'saida') return acc - t.valor
    return acc + t.valor
  }, 0)

let semente = 777
const rnd = () => (semente = (semente * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
const pick = (a) => a[Math.floor(rnd() * a.length)]

describe('saldo da caixinha: tela Metas × app (Investir) × bot', () => {
  it('300 cenários gerados dão o mesmo número nos três', () => {
    for (let k = 0; k < 300; k++) {
      const n = Math.floor(rnd() * 8)
      const txs = Array.from({ length: n }, (_, i) => ({
        id: `t${i}`,
        tipo: pick(['investimento', 'entrada', 'saida']),
        frequencia: pick(['unico', 'mensal']),
        dataInicio: '2026-08-10',
        valor: Math.round(rnd() * 5000) / 10,
        metaId: pick(['g1', 'g1', 'g2', undefined]),
      }))
      const metas = saldoDaTelaMetas(txs, 'g1')
      expect(saldoCaixinha(txs, 'g1')).toBeCloseTo(metas, 6)
      expect(bot.saldoCaixinhaBot(txs, 'g1')).toBeCloseTo(metas, 6)
      const goals = [{ id: 'g1' }]
      expect(reservaDaCaixinha(txs, goals, 'g1')).toBeCloseTo(Math.max(metas, 0), 6)
      expect(bot.reservaDaCaixinhaBot(txs, goals, 'g1')).toBeCloseTo(Math.max(metas, 0), 6)
    }
  })

  it('casos de borda: sem id, caixinha inexistente, valor como texto', () => {
    const txs = [{ tipo: 'investimento', metaId: 'g1', valor: '250.5' }, { tipo: 'saida', metaId: 'g1', valor: 50 }]
    expect(saldoCaixinha(txs, '')).toBe(0)
    expect(reservaDaCaixinha(txs, [], 'g1')).toBe(0)
    expect(reservaDaCaixinha(txs, [{ id: 'g1' }], 'g1')).toBe(200.5)
    expect(bot.reservaDaCaixinhaBot(txs, [{ id: 'g1' }], 'g1')).toBe(200.5)
    expect(bot.reservaDaCaixinhaBot(txs, [], 'g1')).toBe(0)
  })

  it('não é afetado por lançamentos sem lista (undefined)', () => {
    expect(saldoCaixinha(undefined, 'g1')).toBe(0)
    expect(bot.saldoCaixinhaBot(undefined, 'g1')).toBe(0)
  })
})

describe('/reserva e /investimentos no Telegram', () => {
  const config = { investimentos: { perfil: 'clt', mesesMeta: 6, despesasMens: 3000, reservaGoalId: 'g1' } } // meta: R$ 18.000

  beforeEach(() => {
    fake.limpar()
    instalarTelegramFalso()
    criarUsuario({ config })
    fake.seed('goals/g1', { userId: UID, nome: 'Reserva', metaFinal: 18000 })
    lancamento('sal', { tipo: 'entrada', frequencia: 'unico', dataInicio: '2026-10-01', valor: 20000, descricao: 'Salário' })
  })

  const aporte = (id, valor, extra = {}) => lancamento(id, {
    tipo: 'investimento', frequencia: 'unico', dataInicio: '2026-10-05', valor, descricao: 'Aporte: Reserva', metaId: 'g1', ...extra,
  })

  it('/reserva mostra o progresso com os aportes da caixinha', async () => {
    aporte('a1', 4500); aporte('a2', 4500)
    await enviarAoBot(mensagemTelegram('/reserva'))
    const t = ultimaMensagem()
    expect(t).toContain('50%')
    expect(t).toContain('R$ 9.000,00 de R$ 18.000,00')
    expect(t).toContain('Falta')
  })

  it('/reserva com a reserva completa avisa que está completa', async () => {
    aporte('a1', 18000)
    await enviarAoBot(mensagemTelegram('/reserva'))
    expect(ultimaMensagem()).toContain('100%')
  })

  it('/reserva sem nenhum aporte na caixinha: R$ 0 (não inventa valor)', async () => {
    await enviarAoBot(mensagemTelegram('/reserva'))
    expect(ultimaMensagem()).toContain('R$ 0,00 de R$ 18.000,00')
  })

  it('/reserva sem perfil configurado pede a configuração', async () => {
    fake.seed(`config/${UID}`, {})
    await enviarAoBot(mensagemTelegram('/reserva'))
    expect(ultimaMensagem()).toContain('ainda não configurou')
  })

  it('/investimentos: reserva incompleta divide 60/40; completa deixa 100% livre', async () => {
    aporte('a1', 4000)
    await enviarAoBot(mensagemTelegram('/investimentos'))
    expect(ultimaMensagem()).toContain('60%')
    fake.seed(`transactions/${UID}/entries/a1`, { tipo: 'investimento', frequencia: 'unico', dataInicio: '2026-10-05', valor: 18000, descricao: 'x', metaId: 'g1' })
    await enviarAoBot(mensagemTelegram('/investimentos'))
    expect(ultimaMensagem()).not.toContain('60%')
  })

  it('só lê: não grava nada ao consultar a reserva', async () => {
    aporte('a1', 6000)
    const antes = JSON.stringify(fake.lista(`transactions/${UID}/entries`))
    await enviarAoBot(mensagemTelegram('/reserva'))
    expect(JSON.stringify(fake.lista(`transactions/${UID}/entries`))).toBe(antes)
  })
})
