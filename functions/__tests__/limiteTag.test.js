import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRequire } from 'node:module'
import {
  bot, fake, UID, CHAT, HOJE, fixarRelogio, instalarTelegramFalso, enviarAoBot, mensagemTelegram,
  mensagensEnviadas, botModule,
} from './helpers'
import { limitesDoMes, computeTagStats } from '../../src/utils/tags'
import { expandDespesas } from '../../src/utils/despesas'
import { DEFAULT_NOTIFICATION_TIPOS, TIPO_INFO } from '../../src/utils/notificationTypes'

const require = createRequire(import.meta.url)

/**
 * Limite mensal por tag (opcional): alerta N27 (80% e 100%, uma vez por patamar e mês), linhas no /tags e
 * paridade com a tela do Painel. Hoje = 14/10/2026.
 */
fixarRelogio()

const TODOS = Array.from({ length: 27 }, (_, i) => `n${i + 1}`)
const so = (...ligados) => ({ tipos: Object.fromEntries(TODOS.map(n => [n, ligados.includes(n)])) })
const roda = (txs, tags, alertas = ['n27']) =>
  bot.checkNotifications([], txs, { tags }, so(...alertas), [], 0)
const textos = (msgs) => msgs.map(m => String(typeof m === 'string' ? m : m.text).replace(/[  ]/g, ' '))

let seq = 0
const saida = (valor, tag, extra = {}) => ({
  id: `s${++seq}`, tipo: 'saida', frequencia: 'unico', dataInicio: '2026-10-08', valor, descricao: 'Compra', categoria: 'custos_fixos', tag, ...extra,
})
const TAGS = [
  { id: 'mercado', label: 'Mercado', cor: '#10b981', limite: 400 },
  { id: 'streaming', label: 'Streaming', cor: '#8b5cf6' }, // sem limite
]

describe('N27 — patamares', () => {
  it('abaixo de 80%: não avisa', () => {
    expect(roda([saida(319, 'mercado')], TAGS)).toHaveLength(0)
  })

  it('a partir de 80%: avisa com percentual, gasto, limite e o que resta', () => {
    const [m] = roda([saida(340, 'mercado')], TAGS)
    const t = textos([m])[0]
    expect(t).toContain('Tag Mercado em 85% do limite')
    expect(t).toContain('R$ 340,00 de R$ 400,00')
    expect(t).toContain('restam *R$ 60,00*')
    expect(m.estado).toEqual({ chave: 'tag-limite:2026-10:mercado', sig: '80' })
  })

  it('exatamente 100% ainda é alerta (estourou é acima de 100%)', () => {
    const [m] = roda([saida(400, 'mercado')], TAGS)
    expect(m.estado.sig).toBe('80')
  })

  it('acima de 100%: estourou, com quanto passou', () => {
    const [m] = roda([saida(450, 'mercado')], TAGS)
    expect(textos([m])[0]).toContain('Limite da tag Mercado estourado')
    expect(textos([m])[0]).toContain('passou *R$ 50,00*')
    expect(m.estado.sig).toBe('100')
  })

  it('só tags com limite avisam: tag sem limite gasta o quanto for e fica quieta', () => {
    expect(roda([saida(5000, 'streaming')], TAGS)).toHaveLength(0)
  })

  it('sem nenhum limite configurado o alerta nunca dispara', () => {
    expect(roda([saida(5000, 'mercado')], [{ id: 'mercado', label: 'Mercado', cor: '#fff' }])).toHaveLength(0)
    expect(roda([saida(5000, 'mercado')], undefined)).toHaveLength(0)
  })

  it('opção n27 desligada: não avisa', () => {
    expect(roda([saida(450, 'mercado')], TAGS, [])).toHaveLength(0)
  })

  it('duas tags com limite avisam cada uma com a sua chave', () => {
    const tags = [...TAGS, { id: 'transporte', label: 'Transporte', cor: '#3b82f6', limite: 100 }]
    const m = roda([saida(350, 'mercado'), saida(120, 'transporte')], tags)
    expect(m.map(x => x.estado.chave).sort()).toEqual(['tag-limite:2026-10:mercado', 'tag-limite:2026-10:transporte'])
  })
})

describe('N27 — o que conta no gasto da tag', () => {
  it('só o mês corrente (compra de outro mês não entra)', () => {
    expect(roda([saida(500, 'mercado', { dataInicio: '2026-09-08' })], TAGS)).toHaveLength(0)
  })

  it('investimento e despesa sem tag não entram', () => {
    const inv = { id: 'i', tipo: 'investimento', frequencia: 'unico', dataInicio: '2026-10-08', valor: 900, descricao: 'a', categoria: 'liberdade', tag: 'mercado' }
    expect(roda([inv, saida(900, undefined)], TAGS)).toHaveLength(0)
  })

  it('item de fatura de cartão com a tag conta pela data da compra', () => {
    const fatura = {
      id: 'f', tipo: 'cartao', frequencia: 'unico', cartaoId: 'c1', descricao: 'Fatura', dataInicio: '2026-11-10', valor: 380,
      itens: [{ descricao: 'Atacadão', valor: 380, categoria: 'custos_fixos', tag: 'mercado', dataCompra: '2026-10-05' }],
    }
    expect(textos(roda([fatura], TAGS))[0]).toContain('Tag Mercado em 95%')
  })

  it('parcela do mês conta (competência)', () => {
    const fatura = {
      id: 'f', tipo: 'cartao', frequencia: 'unico', cartaoId: 'c1', descricao: 'Fatura', dataInicio: '2026-10-10', valor: 100,
      itens: [{ descricao: 'Geladeira', valor: 350, categoria: 'conforto', tag: 'mercado', dataCompra: '2026-08-02', isParcelado: true, parcelaAtual: 3, totalParcelas: 10 }],
    }
    expect(roda([fatura], TAGS)).toHaveLength(1)
  })
})

describe('N27 — limite editado a qualquer momento', () => {
  const txs = [saida(340, 'mercado')]

  it('baixar o limite no meio do mês pode disparar novo patamar', () => {
    expect(roda(txs, TAGS)[0].estado.sig).toBe('80')
    const baixo = [{ ...TAGS[0], limite: 300 }, TAGS[1]]
    expect(roda(txs, baixo)[0].estado.sig).toBe('100')
  })

  it('subir o limite faz o aviso parar', () => {
    expect(roda(txs, [{ ...TAGS[0], limite: 1000 }, TAGS[1]])).toHaveLength(0)
  })

  it('remover o limite desliga o aviso daquela tag', () => {
    const semLimite = [{ id: 'mercado', label: 'Mercado', cor: '#10b981' }, TAGS[1]]
    expect(roda(txs, semLimite)).toHaveLength(0)
  })

  it('definir um limite numa tag que já gastou no mês avisa na hora', () => {
    const sem = [{ id: 'mercado', label: 'Mercado', cor: '#10b981' }]
    expect(roda([saida(500, 'mercado')], sem)).toHaveLength(0)
    expect(roda([saida(500, 'mercado')], [{ ...sem[0], limite: 400 }])).toHaveLength(1)
  })
})

describe('paridade com o Painel: nível do limite (app) × aviso do bot', () => {
  let semente = 99
  const rnd = () => (semente = (semente * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  const pick = (a) => a[Math.floor(rnd() * a.length)]

  it('200 cenários: mesmo gasto e mesmo nível nos dois lados', () => {
    let alertas = 0, estouros = 0
    for (let k = 0; k < 200; k++) {
      const tags = ['mercado', 'transporte', 'lazer'].map(id => ({
        id, label: id[0].toUpperCase() + id.slice(1), cor: '#fff', ...(rnd() < 0.8 ? { limite: pick([100, 250, 400, 1000]) } : {}),
      }))
      const txs = []
      for (let i = 0; i < 1 + Math.floor(rnd() * 8); i++) {
        const mes = pick(['2026-09', '2026-10', '2026-10', '2026-10'])
        const dia = String(1 + Math.floor(rnd() * 14)).padStart(2, '0')
        const tag = pick(['mercado', 'transporte', 'lazer', undefined])
        if (rnd() < 0.4) {
          txs.push({
            id: `f${i}`, tipo: 'cartao', frequencia: 'unico', cartaoId: 'c1', descricao: 'F', dataInicio: `${mes}-25`, valor: 100,
            itens: [{ descricao: 'Item', valor: pick([30, 90, 150, 220]), categoria: 'conforto', tag, dataCompra: `${mes}-${dia}`, ...(rnd() < 0.2 ? { isParcelado: true, parcelaAtual: 1, totalParcelas: 3 } : {}) }],
          })
        } else {
          txs.push(saida(pick([30, 90, 150, 220, 300]), tag, { dataInicio: `${mes}-${dia}`, id: `s${i}` }))
        }
      }
      const app = limitesDoMes(tags, computeTagStats(expandDespesas(txs, '2026-10-01', '2026-10-31'), tags))
      const avisos = textos(roda(txs, tags))
      for (const l of app) {
        const doTag = avisos.filter(t => t.includes(`tag ${l.label}`.toLowerCase()) || t.includes(`Tag ${l.label}`) || t.includes(`tag ${l.label} `) || t.includes(`da tag ${l.label}`))
        if (l.nivel === 'ok') expect(doTag, `cenário ${k} ${l.id}`).toHaveLength(0)
        else {
          expect(doTag, `cenário ${k} ${l.id}`).toHaveLength(1)
          expect(doTag[0].includes('🚨'), `cenário ${k} ${l.id}`).toBe(l.nivel === 'estourou')
          alertas++
          if (l.nivel === 'estourou') estouros++
        }
      }
      const comLimite = tags.filter(t => t.limite).length
      expect(avisos.length).toBeLessThanOrEqual(comLimite)
    }
    expect(alertas).toBeGreaterThan(30)
    expect(estouros).toBeGreaterThan(10)
  })
})

describe('/tags no Telegram mostra o limite', () => {
  beforeEach(() => { fake.limpar(); instalarTelegramFalso() })
  const semear = (tags, txs) => {
    fake.seed(`users/${UID}`, { telegramChatId: String(CHAT) })
    fake.seed(`config/${UID}`, { tags })
    txs.forEach(t => fake.seed(`transactions/${UID}/entries/${t.id}`, t))
  }
  const pergunta = async (texto = '/tags') => {
    await enviarAoBot(mensagemTelegram(texto))
    return mensagensEnviadas().join('\n')
  }

  it('tag com limite mostra o percentual e o que resta; tag sem limite não ganha linha de limite', async () => {
    semear(TAGS, [saida(340, 'mercado'), saida(60, 'streaming')])
    const t = await pergunta()
    expect(t).toContain('limite R$ 400,00: *85%* (restam R$ 60,00)')
    expect(t.match(/limite R\$/g)).toHaveLength(1)
  })

  it('estourado vem com 🚨 e quanto passou', async () => {
    semear(TAGS, [saida(450, 'mercado')])
    expect(await pergunta()).toMatch(/🚨 limite R\$ 400,00: \*113%\* \(passou R\$ 50,00\)/)
  })

  it('tag com limite e sem gasto no mês aparece com "sem gasto"', async () => {
    semear(TAGS, [saida(60, 'streaming')])
    const t = await pergunta()
    expect(t).toContain('Mercado* — sem gasto')
    expect(t).toContain('✅ limite R$ 400,00: *0%*')
  })

  it('outro mês usa o gasto daquele mês contra o limite atual', async () => {
    semear(TAGS, [saida(300, 'mercado', { dataInicio: '2026-09-08' })])
    expect(await pergunta('/tags setembro')).toContain('limite R$ 400,00: *75%*')
  })
})

describe('N27 pelo agendador: uma vez por patamar e mês', () => {
  const NOITE_MANHA = '10:00:00'
  const executar = async (dia) => { vi.setSystemTime(new Date(`${dia}T${NOITE_MANHA}Z`)); await botModule.dailyNotifications.run({}) }
  const montar = (txs, tags = TAGS) => {
    fake.seed(`users/${UID}`, { telegramChatId: String(CHAT) })
    fake.seed(`config/${UID}`, {
      tags,
      notificacoes: { telegramEnabled: true, horaAlerta: 7, tipos: so(), telegramTipos: so('n27') },
    })
    txs.forEach(t => fake.seed(`transactions/${UID}/entries/${t.id}`, t))
  }
  const avisos = () => mensagensEnviadas().filter(t => /da tag|Tag Mercado/.test(t))

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    fake.limpar(); instalarTelegramFalso()
  })
  afterEach(() => { vi.useRealTimers() })

  it('80% avisa uma vez; nos dias seguintes não repete', async () => {
    montar([saida(340, 'mercado')])
    await executar('2026-10-14'); await executar('2026-10-15'); await executar('2026-10-16')
    expect(avisos()).toHaveLength(1)
  })

  it('ao passar de 100% avisa de novo (patamar novo) e depois fica quieto', async () => {
    montar([saida(340, 'mercado')])
    await executar('2026-10-14')
    fake.seed(`transactions/${UID}/entries/extra`, saida(100, 'mercado', { id: 'extra', dataInicio: '2026-10-15' }))
    await executar('2026-10-15'); await executar('2026-10-16')
    expect(avisos()).toHaveLength(2)
    expect(avisos()[1]).toContain('estourado')
  })

  it('no mês seguinte o aviso pode voltar', async () => {
    montar([saida(340, 'mercado'), saida(350, 'mercado', { id: 'nov', dataInicio: '2026-11-03' })])
    await executar('2026-10-14')
    await executar('2026-11-05')
    expect(avisos()).toHaveLength(2)
  })

  it('tag sem limite não gera aviso nenhum', async () => {
    montar([saida(9000, 'mercado')], [{ id: 'mercado', label: 'Mercado', cor: '#10b981' }])
    await executar('2026-10-14')
    expect(avisos()).toHaveLength(0)
  })
})

describe('listas de alertas: app × bot', () => {
  const { DEFAULT_TG_TIPOS, ALERT_LABELS, ALERT_GROUPS } = require('../lib/comandos/configurar')

  it('os mesmos tipos de alerta existem no app e no bot', () => {
    expect(Object.keys(DEFAULT_TG_TIPOS).sort()).toEqual(Object.keys(DEFAULT_NOTIFICATION_TIPOS).sort())
  })

  it('todo tipo do app tem descrição e todo tipo do bot tem rótulo e grupo', () => {
    for (const id of Object.keys(DEFAULT_NOTIFICATION_TIPOS)) {
      expect(TIPO_INFO[id], `TIPO_INFO ${id}`).toBeTruthy()
      expect(ALERT_LABELS[id], `ALERT_LABELS ${id}`).toBeTruthy()
    }
    const agrupados = ALERT_GROUPS.flatMap(g => g.ids)
    for (const id of Object.keys(DEFAULT_TG_TIPOS)) expect(agrupados, `grupo de ${id}`).toContain(id)
  })

  it('o n27 está ligado por padrão nos dois lados', () => {
    expect(DEFAULT_NOTIFICATION_TIPOS.n27).toBe(true)
    expect(DEFAULT_TG_TIPOS.n27).toBe(true)
  })
})

void HOJE
