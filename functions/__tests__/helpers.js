// Carrega o bot (CommonJS) dentro do vitest. VITEST=true faz o index.js expor __test.
// O Firestore do firebase-admin é trocado por um fake em memória ANTES de carregar o bot.
import { createRequire } from 'node:module'
import { vi, beforeEach, afterEach } from 'vitest'
import { criarFakeFirestore, FieldValue } from './fakeFirestore'

const require = createRequire(import.meta.url)
process.env.VITEST = 'true'

export const fake = criarFakeFirestore()
const admin = require('firebase-admin')
const firestoreFake = () => fake.db
firestoreFake.FieldValue = FieldValue
Object.defineProperty(admin, 'firestore', { value: firestoreFake, configurable: true, writable: true })

export const botModule = require('../index.js')
export const bot = botModule.__test

// 14/10/2026 12:00 em Brasília (15:00 UTC) — o bot e o app usam o relógio em vários pontos
export const HOJE = '2026-10-14'
export function fixarRelogio(iso = '2026-10-14T15:00:00Z') {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(iso)) })
  afterEach(() => { vi.useRealTimers() })
}

// ── Telegram simulado ────────────────────────────────────────────────────────
// Registra o que o bot tentaria enviar; nada sai para a rede.
export const chamadasTelegram = []
export function instalarTelegramFalso({ falharEnvio = null } = {}) {
  chamadasTelegram.length = 0
  vi.stubGlobal('fetch', vi.fn(async (url, opts) => {
    const metodo = String(url).split('/').pop()
    const corpo = opts?.body ? JSON.parse(opts.body) : {}
    chamadasTelegram.push({ metodo, ...corpo })
    const resposta = metodo === 'sendMessage' && falharEnvio ? falharEnvio : { ok: true, result: {} }
    return { json: async () => resposta }
  }))
}
export const mensagensEnviadas = () => chamadasTelegram.filter(c => c.metodo === 'sendMessage').map(c => String(c.text).replace(/[  ]/g, ' '))
export const ultimaMensagem = () => mensagensEnviadas().at(-1) || ''

// ── Requisição/resposta HTTP simuladas ───────────────────────────────────────
export function resposta() {
  const r = { codigo: null, corpo: undefined }
  r.sendStatus = (c) => { r.codigo = c; return r }
  r.status = (c) => { r.codigo = c; return r }
  r.send = (b) => { r.corpo = b; if (r.codigo === null) r.codigo = 200; return r }
  return r
}

// ── Atalhos de cenário ───────────────────────────────────────────────────────
export const UID = 'u1'
export const CHAT = 4242

/** Cria o usuário vinculado ao chat e (opcional) o config dele. */
export function criarUsuario({ config = {}, extra = {} } = {}) {
  fake.seed(`users/${UID}`, { telegramChatId: String(CHAT), ...extra })
  fake.seed(`config/${UID}`, config)
}
export function lancamento(id, dados) {
  fake.seed(`transactions/${UID}/entries/${id}`, dados)
}
export const lancamentos = () => fake.lista(`transactions/${UID}/entries`)

export function mensagemTelegram(texto, chat = CHAT) {
  return { message: { chat: { id: chat }, from: { first_name: 'Vinicius' }, text: texto } }
}
export function botaoTelegram(data, chat = CHAT) {
  return { callback_query: { id: 'cb1', data, message: { chat: { id: chat }, message_id: 7, text: 'Aviso' } } }
}

export async function enviarAoBot(update, { segredo = 'seg' } = {}) {
  process.env.TELEGRAM_SECRET_TOKEN = segredo
  const res = resposta()
  await botModule.telegramWebhook(
    { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': segredo }, body: update }, res)
  return res
}
