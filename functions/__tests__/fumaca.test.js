import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  botModule, fake, UID, CHAT, logger, fixarRelogio, instalarTelegramFalso, enviarAoBot, mensagemTelegram,
  botaoTelegram, mensagensEnviadas, chamadasTelegram, resposta,
} from './helpers'

/**
 * Teste de fumaça: TODO comando, botão e função exportada roda uma vez com dados realistas e não pode
 * estourar erro (ReferenceError, TypeError…) nem registrar erro no log. Existe para proteger reorganizações
 * do código (ex.: dividir o index.js em módulos), que podem esquecer um import só visível quando a função roda.
 */
fixarRelogio('2026-10-14T15:00:00Z')

let espiaoErro
beforeEach(() => {
  fake.limpar()
  instalarTelegramFalso()
  espiaoErro = vi.spyOn(logger, 'error').mockImplementation(() => {})
  semear()
})
afterEach(() => { espiaoErro.mockRestore() })

function semear() {
  fake.seed(`users/${UID}`, { telegramChatId: String(CHAT), webhookToken: 'tok' })
  fake.seed(`config/${UID}`, {
    rendaMensal: 10000,
    budgetPcts: { liberdade: 10, custos_fixos: 30, conforto: 15, metas: 10, prazeres: 15, conhecimento: 10 },
    tags: [{ id: 'mercado', label: 'Mercado', cor: '#10b981' }],
    investimentos: { perfil: 'clt', mesesMeta: 6, despesasMens: 3000, reservaGoalId: 'g1' },
    notificacoes: { telegramEnabled: true, horaAlerta: 7, telegramTipos: { n1: true, n4: false } },
  })
  fake.seed(`cards/${UID}/list/c1`, { nome: 'Nubank', diaVencimento: 10, diaFechamento: 3, limite: 5000 })
  fake.seed('wallets/w1', { userId: UID, nome: 'Conta', saldoInicial: 1000 })
  fake.seed('goals/g1', { userId: UID, nome: 'Reserva de Emergência', metaFinal: 18000 })
  const tx = (id, d) => fake.seed(`transactions/${UID}/entries/${id}`, d)
  tx('sal', { tipo: 'entrada', frequencia: 'mensal', dataInicio: '2026-01-05', valor: 9000, descricao: 'Salário' })
  tx('alu', { tipo: 'saida', frequencia: 'mensal', dataInicio: '2026-01-08', valor: 1800, descricao: 'Aluguel', categoria: 'custos_fixos' })
  tx('mer', { tipo: 'saida', frequencia: 'unico', dataInicio: '2026-10-09', valor: 320, descricao: 'Mercado', categoria: 'custos_fixos', tag: 'mercado' })
  tx('dia', { tipo: 'diario', frequencia: 'unico', dataInicio: '2026-10-14', valor: 45, descricao: 'Lanche', categoria: 'prazeres' })
  tx('apo', { tipo: 'investimento', frequencia: 'unico', dataInicio: '2026-10-06', valor: 2000, descricao: 'Aporte: Reserva', categoria: 'liberdade', metaId: 'g1' })
  tx('sof', { tipo: 'saida', frequencia: 'parcelado', dataInicio: '2026-08-12', valor: 300, descricao: 'Sofá', parcelaAtual: 1, totalParcelas: 10, categoria: 'conforto' })
  tx('fat', {
    tipo: 'cartao', frequencia: 'unico', cartaoId: 'c1', descricao: 'Fatura', dataInicio: '2026-10-10', valor: 700,
    itens: [
      { descricao: 'Restaurante', valor: 100, categoria: 'prazeres', dataCompra: '2026-09-28' },
      { descricao: 'TV', valor: 600, categoria: 'conforto', dataCompra: '2026-07-20', isParcelado: true, parcelaAtual: 3, totalParcelas: 6 },
    ],
  })
  tx('rec', { tipo: 'saida', frequencia: 'mensal', dataInicio: '2026-01-18', valor: 100, descricao: 'Internet', categoria: 'custos_fixos' })
  fake.seed(`users/${UID}/pendingTransactions/p1`, { descricao: 'Padaria', valor: 25, tipo: 'saida', cartaoId: null, carteiraId: null, dataCompra: '2026-10-14' })
  // meses anteriores (para médias, /meses e /gastos)
  for (const m of ['2026-07', '2026-08', '2026-09']) {
    tx(`h${m}`, { tipo: 'saida', frequencia: 'unico', dataInicio: `${m}-10`, valor: 900, descricao: 'Compra', categoria: 'conforto' })
  }
}

const COMANDOS = [
  '/saldo', '/hoje', '/historico', '/semana', '/mes', '/mes setembro', '/resumo', '/categoria', '/meta',
  '/gastos', '/gastos top', '/gastos conforto', '/meses', '/tags', '/reserva', '/investimentos',
  '/cartoes', '/fatura', '/projecao', '/insight', '/proximas', '/previsao', '/economias', '/parcelados',
  '/saldofinal', '/saldofinal dezembro', '/assinaturas', '/configurar', '/alertas', '/ajuda', '/help', '/adicionar', '/xyz',
  '💰 Saldo', '📊 Projeção',
]

describe('comandos do Telegram', () => {
  it.each(COMANDOS)('%s responde sem erro', async (cmd) => {
    const res = await enviarAoBot(mensagemTelegram(cmd))
    expect(res.codigo).toBe(200)
    expect(espiaoErro).not.toHaveBeenCalled()
    expect(mensagensEnviadas().length).toBeGreaterThan(0)
    expect(mensagensEnviadas().join('\n')).not.toMatch(/Erro/i)
  })

  it('/start e /vincular (sem código e com código inválido) respondem', async () => {
    for (const cmd of ['/start', '/vincular', '/vincular ZZZ']) {
      chamadasTelegram.length = 0
      await enviarAoBot(mensagemTelegram(cmd))
      expect(espiaoErro).not.toHaveBeenCalled()
      expect(mensagensEnviadas().length).toBeGreaterThan(0)
    }
  })

  it('chat não vinculado recebe as instruções', async () => {
    await enviarAoBot(mensagemTelegram('/saldo', 555))
    expect(mensagensEnviadas().join('\n')).toContain('vincule sua conta')
  })
})

describe('botões (callback_query)', () => {
  const proj = () => 'fat-proj-1'
  const BOTOES = [
    ['noop', 'noop'],
    ['pagar lançamento único', 'pay:mer:2026-10-09'],
    ['pagar recorrente', 'pay:rec:2026-10-18'],
    ['pagar fatura projetada', () => `pay:${proj()}:2026-11-10`],
    ['adiar lançamento', 'postpone:mer:2026-10-09:5'],
    ['adiar recorrente', 'postpone:rec:2026-10-18:5'],
    ['pagar cartão', 'paycard:c1:2026-11-10'],
    ['confirmar despesa pendente', 'tx_ok:p1:conforto'],
    ['ignorar despesa pendente', 'tx_no:p1'],
    ['alternar alerta', 'tgl_n1'],
    ['ativar todos os alertas', 'cfg_all_on'],
    ['desativar todos os alertas', 'cfg_all_off'],
    ['fechar menu de alertas', 'cfg_done'],
  ]
  it.each(BOTOES)('%s não gera erro', async (_nome, dado) => {
    const data = typeof dado === 'function' ? dado() : dado
    const res = await enviarAoBot(botaoTelegram(data))
    expect(res.codigo).toBe(200)
    expect(espiaoErro).not.toHaveBeenCalled()
  })
})

describe('onboarding', () => {
  it('as 9 respostas padrão (/pular) concluem sem erro', async () => {
    fake.seed(`users/${UID}`, { telegramChatId: String(CHAT), telegramOnboarding: { active: true, stepId: 'horario', data: {} } })
    for (let i = 0; i < 9; i++) await enviarAoBot(mensagemTelegram('/pular'))
    expect(espiaoErro).not.toHaveBeenCalled()
    expect(fake.ler(`users/${UID}`).telegramOnboarding).toBeUndefined()
  })
})

describe('funções exportadas', () => {
  it('exportam exatamente as 5 funções esperadas', () => {
    expect(Object.keys(botModule).filter(k => k !== '__test').sort())
      .toEqual(['dailyNotifications', 'sendTestPush', 'setTelegramWebhook', 'smsWebhook', 'telegramWebhook'])
  })

  it('dailyNotifications.run executa nos três horários sem erro', async () => {
    vi.useRealTimers()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    for (const hora of ['10:00:00', '15:00:00', '22:00:00']) {
      vi.setSystemTime(new Date(`2026-10-15T${hora}Z`))
      await botModule.dailyNotifications.run({})
    }
    expect(espiaoErro).not.toHaveBeenCalled()
  })

  it('sendTestPush sem login recusa; com login e sem token também recusa', async () => {
    await expect(botModule.sendTestPush.run({ auth: null, data: {} })).rejects.toThrow()
    await expect(botModule.sendTestPush.run({ auth: { uid: UID }, data: {} })).rejects.toThrow()
  })

  it('setTelegramWebhook: GET, POST com url e POST de comandos', async () => {
    const chamar = async (req) => {
      const res = resposta()
      res.json = (b) => { res.corpo = b; res.codigo = 200; return res }
      await botModule.setTelegramWebhook(req, res)
      return res
    }
    expect((await chamar({ method: 'GET' })).codigo).toBe(200)
    expect((await chamar({ method: 'POST', body: { url: 'https://x.test/hook' } })).codigo).toBe(200)
    expect((await chamar({ method: 'POST', body: { registerCommands: true } })).codigo).toBe(200)
  })

  it('smsWebhook processa uma notificação bancária', async () => {
    const res = resposta()
    await botModule.smsWebhook({ query: { token: 'tok' }, body: { text: 'Compra aprovada no seu Nubank no crédito, R$ 45,90 em Padaria' } }, res)
    expect(res.codigo).toBe(200)
    expect(espiaoErro).not.toHaveBeenCalled()
  })
})
