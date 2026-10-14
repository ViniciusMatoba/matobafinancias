import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  botModule, fake, UID, CHAT, instalarTelegramFalso, mensagensEnviadas, chamadasTelegram,
  pushesEnviados, pushConfig,
} from './helpers'

/**
 * dailyNotifications de ponta a ponta: usuários, config e lançamentos num Firestore em memória; Telegram e
 * push simulados. Os testes rodam o agendador em dias e horários diferentes (07h Brasília = 10:00 UTC).
 */
const TODOS = Array.from({ length: 25 }, (_, i) => `n${i + 1}`)
const so = (...ligados) => Object.fromEntries(TODOS.map(n => [n, ligados.includes(n)]))

const executar = async (diaISO, horaUTC = '10:00:00') => {
  vi.setSystemTime(new Date(`${diaISO}T${horaUTC}Z`))
  await botModule.dailyNotifications.run({})
}

let seq = 0
const entrada = (valor, extra = {}) => lancamento({ tipo: 'entrada', frequencia: 'unico', dataInicio: '2026-10-01', descricao: 'Salário', valor, ...extra })
const lancamento = (dados) => fake.seed(`transactions/${UID}/entries/t${++seq}`, dados)

/** Cria o usuário com os canais pedidos e só os alertas indicados ligados. */
function usuario({ telegram = true, push = false, alertas = [], alertasTg = alertas, hora = 7, config = {} } = {}) {
  fake.seed(`users/${UID}`, {
    ...(telegram ? { telegramChatId: String(CHAT) } : {}),
    ...(push ? { fcmToken: 'tok-push' } : {}),
  })
  fake.seed(`config/${UID}`, {
    notificacoes: {
      enabled: push, telegramEnabled: telegram, horaAlerta: hora,
      tipos: so(...alertas), telegramTipos: so(...alertasTg),
    },
    ...config,
  })
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true }) // o agendador espera 100 ms entre mensagens
  fake.limpar()
  instalarTelegramFalso()
  pushesEnviados.length = 0
  pushConfig.falhar = null
  seq = 0
})
afterEach(() => { vi.useRealTimers() })

describe('horário e canais', () => {
  it('só roda para o usuário na hora configurada', async () => {
    usuario({ alertas: ['n23'], hora: 12 })
    entrada(3000)
    await executar('2026-10-15') // 07h BR, mas o usuário quer 12h
    expect(mensagensEnviadas()).toHaveLength(0)
  })

  it('na hora certa o N23 do dia 15 sai pelo Telegram', async () => {
    usuario({ alertas: ['n23'] })
    entrada(3000)
    await executar('2026-10-15')
    expect(mensagensEnviadas().join('\n')).toContain('Lembrete de Investimento — Dia 15')
    expect(chamadasTelegram.find(c => c.metodo === 'sendMessage').chat_id).toBe(String(CHAT))
  })

  it('usuário sem Telegram nem push ativados é ignorado', async () => {
    usuario({ telegram: false, push: false, alertas: ['n23'] })
    entrada(3000)
    await executar('2026-10-15')
    expect(mensagensEnviadas()).toHaveLength(0)
    expect(pushesEnviados).toHaveLength(0)
  })

  it('canais independentes: o push só leva os tipos do push e o Telegram os do Telegram', async () => {
    usuario({ push: true, alertas: ['n23'], alertasTg: [] })
    entrada(3000)
    await executar('2026-10-15')
    expect(pushesEnviados).toHaveLength(1)
    expect(pushesEnviados[0].token).toBe('tok-push')
    expect(mensagensEnviadas()).toHaveLength(0)
  })

  it('dois usuários são tratados separadamente', async () => {
    usuario({ alertas: ['n23'] })
    entrada(3000)
    fake.seed('users/u2', { telegramChatId: '999' })
    fake.seed('config/u2', { notificacoes: { telegramEnabled: true, horaAlerta: 7, telegramTipos: so('n23'), tipos: so() } })
    await executar('2026-10-15')
    const chats = chamadasTelegram.filter(c => c.metodo === 'sendMessage').map(c => c.chat_id)
    expect(chats.sort()).toEqual(['4242', '999'])
  })
})

describe('N24 pelo agendador (Telegram) — roda no ciclo das 19h, junto com o N18', () => {
  const NOITE = '22:00:00' // 19h em Brasília
  const rastreio = () => fake.ler(`config/${UID}`).reservaTracking
  const avisosN24 = () => mensagensEnviadas().filter(t => t.includes('Aporte pendente'))

  it('ao longo dos dias: começa a rastrear, cobra aos 5 dias e repete aos 10', async () => {
    usuario({ alertas: ['n24'] })
    entrada(3000)
    await executar('2026-10-14', NOITE)
    expect(rastreio()).toMatchObject({ sobraData: '2026-10-14', lastRemindData: null })
    await executar('2026-10-16', NOITE)
    expect(avisosN24()).toHaveLength(0)
    await executar('2026-10-19', NOITE)
    expect(avisosN24()).toHaveLength(1)
    await executar('2026-10-21', NOITE)
    expect(avisosN24()).toHaveLength(1)
    await executar('2026-10-24', NOITE)
    expect(avisosN24()).toHaveLength(2)
  })

  it('aportar zera a cobrança', async () => {
    usuario({ alertas: ['n24'] })
    entrada(9000)
    await executar('2026-10-14', NOITE)
    lancamento({ tipo: 'investimento', frequencia: 'unico', dataInicio: '2026-10-16', descricao: 'Aporte', valor: 500 })
    await executar('2026-10-20', NOITE)
    expect(avisosN24()).toHaveLength(0)
    expect(rastreio().sobraData).toBe('2026-10-20')
  })

  it('aporte automático (mensal, criado meses antes) que cai no período evita a cobrança indevida', async () => {
    usuario({ alertas: ['n24'] })
    entrada(9000)
    lancamento({ tipo: 'investimento', frequencia: 'mensal', dataInicio: '2026-01-16', descricao: 'Aporte automático', valor: 500 })
    const dias = ['14', '15', '16', '17', '18', '19', '20', '21'].map(d => `2026-10-${d}`)
    for (const d of dias) await executar(d, NOITE)
    // sem o reconhecimento por ocorrência, a cobrança sairia em 19/10 (5 dias após 14/10)
    expect(avisosN24()).toHaveLength(0)
  })

  it('a sobra gasta antes de aportar encerra o rastreio e não cobra', async () => {
    usuario({ alertas: ['n24'] })
    entrada(3000)
    await executar('2026-10-14', NOITE)
    expect(rastreio()).toBeTruthy()
    lancamento({ tipo: 'saida', frequencia: 'unico', dataInicio: '2026-10-15', descricao: 'Compra grande', valor: 2900, categoria: 'conforto' })
    await executar('2026-10-20', NOITE)
    expect(avisosN24()).toHaveLength(0)
    expect(fake.ler(`config/${UID}`).reservaTracking).toBeUndefined()
  })

  it('opção n24 desligada no Telegram: não rastreia nem avisa', async () => {
    usuario({ alertas: [], alertasTg: [] })
    entrada(3000)
    await executar('2026-10-14', NOITE)
    expect(fake.ler(`config/${UID}`).reservaTracking).toBeUndefined()
  })

  it('sem Telegram ativado o N24 não roda', async () => {
    usuario({ telegram: false, push: true, alertas: ['n24'] })
    entrada(3000)
    await executar('2026-10-14', NOITE)
    expect(fake.ler(`config/${UID}`).reservaTracking).toBeUndefined()
  })
})

describe('memória de avisos (não repetir) pelo agendador', () => {
  const saldoNegativo = () => lancamento({ tipo: 'saida', frequencia: 'unico', dataInicio: '2026-10-01', descricao: 'Conta', valor: 500, categoria: 'custos_fixos' })

  it('mesmo aviso no dia seguinte não se repete; urgente repete após 3 dias', async () => {
    usuario({ alertas: ['n6'] })
    saldoNegativo()
    await executar('2026-10-14')
    await executar('2026-10-15')
    await executar('2026-10-16')
    expect(mensagensEnviadas().filter(t => t.includes('Saldo atual negativo'))).toHaveLength(1)
    await executar('2026-10-17')
    expect(mensagensEnviadas().filter(t => t.includes('Saldo atual negativo'))).toHaveLength(2)
  })

  it('o estado fica em alertasEstado/{uid} por canal', async () => {
    usuario({ alertas: ['n6'] })
    saldoNegativo()
    await executar('2026-10-14')
    const estado = fake.ler(`alertasEstado/${UID}`)
    expect(Object.keys(estado.telegram)).toContain('saldo-negativo')
  })

  it('condição que some e volta reavisa', async () => {
    usuario({ alertas: ['n6'] })
    saldoNegativo()
    await executar('2026-10-14')
    entrada(5000, { dataInicio: '2026-10-14' }) // saldo volta ao positivo
    await executar('2026-10-15')
    fake.seed(`transactions/${UID}/entries/t99`, { tipo: 'saida', frequencia: 'unico', dataInicio: '2026-10-16', descricao: 'Outra', valor: 9000, categoria: 'conforto' })
    await executar('2026-10-17')
    expect(mensagensEnviadas().filter(t => t.includes('Saldo atual negativo'))).toHaveLength(2)
  })
})

describe('falhas de envio', () => {
  const saldoNegativo = () => lancamento({ tipo: 'saida', frequencia: 'unico', dataInicio: '2026-10-01', descricao: 'Conta', valor: 500, categoria: 'custos_fixos' })

  it('push que falha não marca o aviso como enviado: tenta de novo no dia seguinte', async () => {
    usuario({ telegram: false, push: true, alertas: ['n6'] })
    saldoNegativo()
    pushConfig.falhar = 'messaging/internal-error'
    await executar('2026-10-14')
    expect(pushesEnviados).toHaveLength(0)
    pushConfig.falhar = null
    await executar('2026-10-15')
    expect(pushesEnviados).toHaveLength(1)
  })

  it('token de push inválido é removido do usuário', async () => {
    usuario({ telegram: false, push: true, alertas: ['n6'] })
    saldoNegativo()
    pushConfig.falhar = 'messaging/registration-token-not-registered'
    await executar('2026-10-14')
    expect(fake.ler(`users/${UID}`).fcmToken).toBeUndefined()
  })

  it('Telegram com erro temporário não marca como avisado', async () => {
    usuario({ alertas: ['n6'] })
    saldoNegativo()
    instalarTelegramFalso({ falharEnvio: { ok: false, error_code: 429, description: 'Too Many Requests' } })
    await executar('2026-10-14')
    instalarTelegramFalso()
    await executar('2026-10-15')
    expect(mensagensEnviadas().filter(t => t.includes('Saldo atual negativo'))).toHaveLength(1)
  })

  it('bot bloqueado pelo usuário desativa o Telegram dele', async () => {
    usuario({ alertas: ['n6'] })
    saldoNegativo()
    instalarTelegramFalso({ falharEnvio: { ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' } })
    await executar('2026-10-14')
    expect(fake.ler(`users/${UID}`).telegramChatId).toBeUndefined()
    expect(fake.ler(`config/${UID}`).notificacoes.telegramEnabled).toBe(false)
  })
})
