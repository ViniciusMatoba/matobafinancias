import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRequire } from 'node:module'
import {
  bot, fake, UID, CHAT, fixarRelogio, instalarTelegramFalso, mensagensEnviadas, botModule,
} from './helpers'
import { DEFAULT_NOTIFICATION_TIPOS } from '../../src/utils/notificationTypes'

const require = createRequire(import.meta.url)
const { DEFAULT_TG_TIPOS } = require('../lib/comandos/configurar')

/**
 * N26 — aviso de assinaturas (reajuste e assinatura nova). Nasce DESLIGADO. Hoje = 14/10/2026.
 * Itens são lançados no dia 5 do mês (mês lógico = o próprio mês).
 */
fixarRelogio()

const TODOS = Array.from({ length: 27 }, (_, i) => `n${i + 1}`)
const tiposSo = (...ligados) => Object.fromEntries(TODOS.map(n => [n, ligados.includes(n)]))
const TAGS = [{ id: 'assinaturas', label: 'Assinaturas', cor: '#8b5cf6' }]

let seq = 0
const fatura = (mes, itens, extra = {}) => ({
  id: `f${++seq}`, tipo: 'cartao', frequencia: 'unico', cartaoId: 'c1', descricao: 'Fatura', dataInicio: `${mes}-10`,
  valor: itens.reduce((s, i) => s + i.valor, 0), itens, ...extra,
})
const item = (descricao, valor, mes, extra = {}) => ({ descricao, valor, categoria: 'prazeres', dataCompra: `${mes}-05`, ...extra })
const mensal = (nome, pares, extra = {}) => pares.map(([mes, valor]) => fatura(mes, [item(nome, valor, mes, extra)]))
/** Compras variáveis de fundo: dão histórico de meses sem virar assinatura (valor oscila). */
const fundo = (meses) => meses.map((m, i) => fatura(m, [item('Mercado', 200 + i * 55, m)]))

const roda = (txs, { n26 = true, config = {} } = {}) =>
  bot.checkNotifications([], txs, { tags: TAGS, ...config }, { tipos: tiposSo(...(n26 ? ['n26'] : [])) }, [], 0)
const textos = (msgs) => msgs.map(m => String(typeof m === 'string' ? m : m.text).replace(/[  ]/g, ' '))

const MESES6 = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']

describe('N26 — desligado por padrão', () => {
  const comReajuste = [...mensal('Netflix', [['2026-06', 40], ['2026-07', 40], ['2026-08', 40], ['2026-09', 40], ['2026-10', 50]])]

  it('sem n26 nas preferências nada é enviado, mesmo com reajuste', () => {
    expect(bot.checkNotifications([], comReajuste, { tags: TAGS }, { tipos: {} }, [], 0).filter(m => String(m.text || m).includes('Reajuste'))).toHaveLength(0)
  })

  it('n26 false nada é enviado', () => {
    expect(roda(comReajuste, { n26: false })).toHaveLength(0)
  })

  it('ligar só outros alertas não liga o N26 (diferente dos demais, que valem até serem desligados)', () => {
    const m = bot.checkNotifications([], comReajuste, { tags: TAGS }, { tipos: { n27: true } }, [], 0)
    expect(textos(m).some(t => t.includes('Reajuste'))).toBe(false)
  })

  it('o padrão é desligado no app e no bot', () => {
    expect(DEFAULT_NOTIFICATION_TIPOS.n26).toBe(false)
    expect(DEFAULT_TG_TIPOS.n26).toBe(false)
  })
})

describe('N26 — reajuste', () => {
  it('aumento neste mês: avisa com o percentual e o efeito no ano', () => {
    const [m] = roda(mensal('Netflix', [['2026-06', 40], ['2026-07', 40], ['2026-08', 40], ['2026-09', 40], ['2026-10', 50]]))
    const t = textos([m])[0]
    expect(t).toContain('Reajuste: Netflix')
    expect(t).toContain('de R$ 40,00 para *R$ 50,00*')
    expect(t).toContain('+25%')
    expect(t).toContain('R$ 120,00 a mais por ano')
    expect(m.estado).toEqual({ chave: 'assin:c1|netflix', sig: 'r:50' })
  })

  it('o aumento do mês passado ainda é avisado (a cobrança deste mês pode não ter sido lançada)', () => {
    const txs = mensal('Netflix', [['2026-06', 40], ['2026-07', 40], ['2026-08', 40], ['2026-09', 50]])
    expect(textos(roda(txs))[0]).toContain('Reajuste: Netflix')
  })

  it('aumento de dois meses atrás não é mais novidade', () => {
    const txs = mensal('Netflix', [['2026-05', 40], ['2026-06', 40], ['2026-07', 40], ['2026-08', 50], ['2026-09', 50], ['2026-10', 50]])
    expect(roda(txs)).toHaveLength(0)
  })

  it('redução também avisa, com outro texto', () => {
    const t = textos(roda(mensal('Spotify', [['2026-06', 30], ['2026-07', 30], ['2026-08', 30], ['2026-09', 30], ['2026-10', 20]])))[0]
    expect(t).toContain('Baixou: Spotify')
    expect(t).toContain('R$ 120,00 a menos por ano')
  })

  it('valor estável não avisa nada (sem enxurrada na primeira execução)', () => {
    const txs = [...mensal('Netflix', MESES6.map(m => [m, 44.9])), ...mensal('Spotify', MESES6.map(m => [m, 21.9])), ...fundo(MESES6)]
    expect(roda(txs)).toHaveLength(0)
  })

  it('item que oscila todo mês (mercado, delivery) nunca gera aviso de reajuste', () => {
    expect(roda(fundo(MESES6))).toHaveLength(0)
  })

  it('variação dentro de 5% não é reajuste', () => {
    expect(roda(mensal('Netflix', [['2026-07', 100], ['2026-08', 100], ['2026-09', 100], ['2026-10', 104]]))).toHaveLength(0)
  })

  it('item oculto no app não avisa', () => {
    const txs = mensal('Netflix', [['2026-06', 40], ['2026-07', 40], ['2026-08', 40], ['2026-09', 40], ['2026-10', 50]])
    expect(roda(txs, { config: { assinaturasIgnoradas: ['c1|netflix'] } })).toHaveLength(0)
  })
})

describe('N26 — assinatura nova', () => {
  it('aparece em 2 meses seguidos, depois de um histórico: avisa uma vez com valor mensal e anual', () => {
    const txs = [...fundo(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']), ...mensal('Disney+', [['2026-09', 33.9], ['2026-10', 33.9]])]
    const [m] = roda(txs)
    const t = textos([m])[0]
    expect(t).toContain('Nova assinatura detectada: Disney+')
    expect(t).toContain('R$ 33,90 por mês (R$ 406,80 por ano)')
    expect(t).toContain('Painel → Assinaturas')
    expect(m.estado).toEqual({ chave: 'assin:c1|disney+', sig: 'n:33.9' })
  })

  it('no começo do uso (pouco histórico) não trata tudo como novo', () => {
    const txs = [...mensal('Netflix', [['2026-09', 44.9], ['2026-10', 44.9]]), ...mensal('Spotify', [['2026-09', 21.9], ['2026-10', 21.9]])]
    expect(roda(txs)).toHaveLength(0)
  })

  it('na terceira aparição deixa de ser "nova"', () => {
    const txs = [...fundo(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']), ...mensal('Disney+', [['2026-08', 33.9], ['2026-09', 33.9], ['2026-10', 33.9]])]
    expect(roda(txs)).toHaveLength(0)
  })

  it('item com a tag Assinaturas avisa já na primeira aparição, mesmo sem histórico', () => {
    const t = textos(roda([fatura('2026-10', [item('Curso online', 99, '2026-10', { tag: 'assinaturas' })])]))[0]
    expect(t).toContain('Nova assinatura (tag Assinaturas): Curso online')
  })

  it('item com a tag e já antigo não avisa de novo', () => {
    const txs = mensal('Cloud', MESES6.map(m => [m, 12]), { tag: 'assinaturas' })
    expect(roda(txs)).toHaveLength(0)
  })

  it('parcelas e itens variáveis nunca viram "assinatura nova"', () => {
    const parcelas = ['2026-09', '2026-10'].map((m, i) =>
      fatura(m, [item('TV', 200, m, { isParcelado: true, parcelaAtual: 2 + i, totalParcelas: 6 })]))
    const txs = [...fundo(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']), ...parcelas, ...mensal('Uber', [['2026-09', 20], ['2026-10', 55]])]
    expect(roda(txs)).toHaveLength(0)
  })
})

describe('N26 pelo agendador: cada mudança avisa uma vez', () => {
  const executar = async (dia) => { vi.setSystemTime(new Date(`${dia}T10:00:00Z`)); await botModule.dailyNotifications.run({}) }
  const montar = (txs, ligado = true) => {
    fake.seed(`users/${UID}`, { telegramChatId: String(CHAT) })
    fake.seed(`config/${UID}`, {
      tags: TAGS,
      notificacoes: { telegramEnabled: true, horaAlerta: 7, tipos: tiposSo(), telegramTipos: tiposSo(...(ligado ? ['n26'] : [])) },
    })
    txs.forEach(t => fake.seed(`transactions/${UID}/entries/${t.id}`, t))
  }
  const avisos = () => mensagensEnviadas().filter(t => /Reajuste|Nova assinatura|Baixou/.test(t))
  const REAJ = mensal('Netflix', [['2026-06', 40], ['2026-07', 40], ['2026-08', 40], ['2026-09', 40], ['2026-10', 50]])

  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); fake.limpar(); instalarTelegramFalso() })
  afterEach(() => { vi.useRealTimers() })

  it('avisa uma vez e nos dias seguintes não repete', async () => {
    montar(REAJ)
    await executar('2026-10-14'); await executar('2026-10-15'); await executar('2026-10-16')
    expect(avisos()).toHaveLength(1)
  })

  it('outra assinatura que reajusta depois avisa só a nova (a anterior não repete)', async () => {
    montar(REAJ)
    await executar('2026-10-14')
    mensal('Spotify', [['2026-06', 30], ['2026-07', 30], ['2026-08', 30], ['2026-09', 30], ['2026-10', 35]])
      .forEach(t => fake.seed(`transactions/${UID}/entries/${t.id}`, t))
    await executar('2026-10-15')
    const lista = avisos()
    expect(lista).toHaveLength(2)
    expect(lista[0]).toContain('Netflix')
    expect(lista[1]).toContain('Spotify')
  })

  it('o mesmo item com dois reajustes na janela de 6 meses vira "valor variável" e deixa de avisar', async () => {
    // limitação conhecida da regra de estabilidade (no máximo 1 mudança de valor na janela)
    const duplo = mensal('Netflix', [['2026-06', 40], ['2026-07', 40], ['2026-08', 40], ['2026-09', 50], ['2026-10', 60]])
    expect(roda(duplo)).toHaveLength(0)
  })

  it('desligado (padrão): não envia nada', async () => {
    montar(REAJ, false)
    await executar('2026-10-14')
    expect(avisos()).toHaveLength(0)
  })

  it('usuário que nunca mexeu nos alertas (sem n26 salvo) também fica sem aviso', async () => {
    fake.seed(`users/${UID}`, { telegramChatId: String(CHAT) })
    fake.seed(`config/${UID}`, { tags: TAGS, notificacoes: { telegramEnabled: true, horaAlerta: 7, tipos: {}, telegramTipos: { n27: true } } })
    REAJ.forEach(t => fake.seed(`transactions/${UID}/entries/${t.id}`, t))
    await executar('2026-10-14')
    expect(avisos()).toHaveLength(0)
  })
})
