import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  botModule, fake, UID, CHAT, fixarRelogio, instalarTelegramFalso, resposta, mensagemTelegram,
  mensagensEnviadas, chamadasTelegram, criarUsuario,
} from './helpers'

fixarRelogio()

beforeEach(() => {
  fake.limpar()
  instalarTelegramFalso()
})
afterEach(() => { delete process.env.TELEGRAM_SECRET_TOKEN })

const chamarTelegram = async ({ metodo = 'POST', segredo, enviarSegredo = true, corpo = mensagemTelegram('/ajuda') } = {}) => {
  const res = resposta()
  const headers = enviarSegredo && segredo !== undefined ? { 'x-telegram-bot-api-secret-token': segredo } : {}
  await botModule.telegramWebhook({ method: metodo, headers, body: corpo }, res)
  return res
}

describe('telegramWebhook — autenticação', () => {
  it('só aceita POST', async () => {
    process.env.TELEGRAM_SECRET_TOKEN = 'seg'
    expect((await chamarTelegram({ metodo: 'GET', segredo: 'seg' })).codigo).toBe(405)
  })

  it('sem segredo configurado no servidor, recusa tudo (503)', async () => {
    delete process.env.TELEGRAM_SECRET_TOKEN
    criarUsuario()
    const res = await chamarTelegram({ segredo: 'qualquer' })
    expect(res.codigo).toBe(503)
    expect(mensagensEnviadas()).toHaveLength(0)
  })

  it('segredo errado: 403 e nada é processado', async () => {
    process.env.TELEGRAM_SECRET_TOKEN = 'seg'
    criarUsuario()
    const res = await chamarTelegram({ segredo: 'errado' })
    expect(res.codigo).toBe(403)
    expect(mensagensEnviadas()).toHaveLength(0)
  })

  it('cabeçalho ausente: 403', async () => {
    process.env.TELEGRAM_SECRET_TOKEN = 'seg'
    criarUsuario()
    const res = await chamarTelegram({ enviarSegredo: false })
    expect(res.codigo).toBe(403)
  })

  it('segredo certo: 200 e o comando é executado', async () => {
    process.env.TELEGRAM_SECRET_TOKEN = 'seg'
    criarUsuario()
    const res = await chamarTelegram({ segredo: 'seg' })
    expect(res.codigo).toBe(200)
    expect(mensagensEnviadas().join('\n')).toContain('/saldo')
  })

  it('erro interno ainda responde 200 (o Telegram não deve reenviar em loop)', async () => {
    process.env.TELEGRAM_SECRET_TOKEN = 'seg'
    criarUsuario()
    const res = await chamarTelegram({ segredo: 'seg', corpo: { callback_query: { id: 'x', data: 'pay:naoexiste:2026-10-20', message: { chat: { id: CHAT }, message_id: 1 } } } })
    expect(res.codigo).toBe(200)
  })

  it('update sem mensagem de texto é ignorado com 200', async () => {
    process.env.TELEGRAM_SECRET_TOKEN = 'seg'
    const res = await chamarTelegram({ segredo: 'seg', corpo: { message: { chat: { id: 1 } } } })
    expect(res.codigo).toBe(200)
    expect(mensagensEnviadas()).toHaveLength(0)
  })
})

describe('smsWebhook — notificação bancária', () => {
  const chamarSms = async ({ token, corpo }) => {
    const res = resposta()
    await botModule.smsWebhook({ query: token === undefined ? {} : { token }, body: corpo }, res)
    return res
  }
  const comWebhook = (extra = {}) => {
    fake.seed(`users/${UID}`, { telegramChatId: String(CHAT), webhookToken: 'tok123', ...extra })
    fake.seed(`config/${UID}`, {})
  }

  it('sem token: 400', async () => {
    expect((await chamarSms({ corpo: 'x' })).codigo).toBe(400)
  })

  it('token inválido: 403 e nada é gravado', async () => {
    comWebhook()
    const res = await chamarSms({ token: 'errado', corpo: { text: 'Compra R$ 10,00 no Mercado' } })
    expect(res.codigo).toBe(403)
    expect(fake.lista(`users/${UID}/pendingTransactions`)).toHaveLength(0)
  })

  it('usuário sem Telegram vinculado: 400', async () => {
    fake.seed(`users/${UID}`, { webhookToken: 'tok123' })
    const res = await chamarSms({ token: 'tok123', corpo: { text: 'Compra R$ 10,00 no Mercado' } })
    expect(res.codigo).toBe(400)
  })

  it('texto que não é notificação bancária: 200 sem criar pendência', async () => {
    comWebhook()
    const res = await chamarSms({ token: 'tok123', corpo: { text: 'oi, tudo bem?' } })
    expect(res.codigo).toBe(200)
    expect(fake.lista(`users/${UID}/pendingTransactions`)).toHaveLength(0)
    expect(mensagensEnviadas()).toHaveLength(0)
  })

  it('notificação válida: cria a pendência e pergunta a categoria no Telegram', async () => {
    comWebhook()
    const res = await chamarSms({ token: 'tok123', corpo: { text: 'Compra aprovada no seu Nubank no crédito, R$ 45,90 em Padaria Central' } })
    expect(res.codigo).toBe(200)
    const pendentes = fake.lista(`users/${UID}/pendingTransactions`)
    expect(pendentes).toHaveLength(1)
    expect(pendentes[0].valor).toBeCloseTo(45.9, 2)
    expect(pendentes[0].tipo).toBe('cartao')
    const envio = chamadasTelegram.find(c => c.metodo === 'sendMessage')
    expect(envio.text).toContain('Novo gasto detectado')
    const botoes = envio.reply_markup.inline_keyboard.flat().map(b => b.callback_data)
    expect(botoes).toContain(`tx_ok:${pendentes[0].id}:custos_fixos`)
    expect(botoes).toContain(`tx_no:${pendentes[0].id}`)
  })

  it('débito/pix vira saída e usa a carteira do banco quando existe', async () => {
    comWebhook()
    fake.seed('wallets/w1', { userId: UID, nome: 'Nubank', saldoInicial: 0 })
    await chamarSms({ token: 'tok123', corpo: 'Pix enviado pelo Nubank R$ 20,00 para Maria' })
    const [p] = fake.lista(`users/${UID}/pendingTransactions`)
    expect(p.tipo).toBe('saida')
    expect(p.carteiraId).toBe('w1')
  })

  it('o token de um usuário não alcança dados de outro', async () => {
    comWebhook()
    fake.seed('users/outro', { telegramChatId: '777', webhookToken: 'tokOutro' })
    await chamarSms({ token: 'tok123', corpo: { text: 'Compra R$ 10,00 no Mercado' } })
    expect(fake.lista('users/outro/pendingTransactions')).toHaveLength(0)
    expect(fake.lista(`users/${UID}/pendingTransactions`)).toHaveLength(1)
  })
})
