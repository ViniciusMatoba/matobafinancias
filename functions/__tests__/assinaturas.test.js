import { describe, it, expect, beforeEach } from 'vitest'
import { createRequire } from 'node:module'
import {
  fake, UID, CHAT, HOJE, fixarRelogio, instalarTelegramFalso, enviarAoBot, mensagemTelegram, mensagensEnviadas,
} from './helpers'
import { detectarAssinaturas, chaveDescricao as chaveApp } from '../../src/utils/assinaturas'
import { criarDadosDemo } from '../../src/demo/dados'

const require = createRequire(import.meta.url)
const { detectarAssinaturasBot, chaveDescricao: chaveBot } = require('../lib/motor/assinaturas')

/**
 * Paridade app × bot do motor de assinaturas + o comando /assinaturas de ponta a ponta.
 */
fixarRelogio()

// ── Gerador de cenários (semente fixa) ─────────────────────────────────────────
let semente = 20261014
const rnd = () => (semente = (semente * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
const pick = (a) => a[Math.floor(rnd() * a.length)]
const dia2 = (n) => String(n).padStart(2, '0')
const mesesAtras = (n) => { const d = new Date(Date.UTC(2026, 9 - n, 1)); return `${d.getUTCFullYear()}-${dia2(d.getUTCMonth() + 1)}` }

const NOMES = ['Netflix', 'NETFLIX 10/12', 'Spotify', 'Uber *TRIP 22', 'iFood', 'Academia', 'Google One', 'Disney+', 'Mercado Central', 'Cloud', 'TV', 'Padaria']

function gerarCenario() {
  const txs = []
  const nFaturas = 4 + Math.floor(rnd() * 12)
  for (let i = 0; i < nFaturas; i++) {
    const mes = mesesAtras(Math.floor(rnd() * 8))
    const itens = []
    const nItens = 1 + Math.floor(rnd() * 4)
    for (let j = 0; j < nItens; j++) {
      const nome = pick(NOMES)
      const parcelado = nome === 'TV' && rnd() < 0.8
      itens.push({
        descricao: nome, valor: pick([9.99, 21.9, 27.9, 44.9, 119.9, 40 + Math.round(rnd() * 60)]),
        categoria: 'prazeres', dataCompra: `${mes}-${dia2(1 + Math.floor(rnd() * 28))}`,
        ...(rnd() < 0.2 ? { tag: pick(['assinaturas', 'mercado']) } : {}),
        ...(parcelado ? { isParcelado: true, parcelaAtual: 1 + Math.floor(rnd() * 4), totalParcelas: 6 } : {}),
      })
    }
    txs.push({
      id: `f${i}`, tipo: 'cartao', frequencia: 'unico', cartaoId: pick(['c1', 'c1', 'c2']), descricao: 'Fatura',
      dataInicio: `${mes}-10`, valor: itens.reduce((s, x) => s + x.valor, 0), itens,
      ...(rnd() < 0.15 ? { exclusoes: [`${mes}-10`] } : {}),
    })
  }
  // recorrentes comuns
  const nRec = Math.floor(rnd() * 4)
  for (let i = 0; i < nRec; i++) {
    txs.push({
      id: `r${i}`, tipo: pick(['saida', 'saida', 'entrada', 'investimento']), frequencia: pick(['mensal', 'semanal', 'unico']),
      dataInicio: pick(['2026-01-10', '2026-09-30', '2026-12-01']), valor: pick([50, 129.9, 1800]), descricao: pick(['Aluguel', 'Internet', 'Ajuste de saldo', 'Feira']),
      ...(rnd() < 0.3 ? { dataFim: pick(['2026-08-31', '2027-03-31']) } : {}),
    })
  }
  return txs
}

const TAGS = [{ id: 'assinaturas', label: 'Assinaturas', cor: '#8b5cf6' }, { id: 'mercado', label: 'Mercado', cor: '#10b981' }]

describe('paridade app × bot — motor de assinaturas', () => {
  it('chaveDescricao é idêntica nos dois lados', () => {
    for (const d of ['Netflix', 'NETFLIX 10/12', 'Uber *TRIP 1234', 'Spotify (3/6)', 'PAG*Disney+', '  Google   One ', 'Água e Luz', '', '123', undefined]) {
      expect(chaveBot(d)).toBe(chaveApp(d))
    }
  })

  it('300 cenários gerados dão exatamente o mesmo resultado', () => {
    for (let k = 0; k < 300; k++) {
      const txs = gerarCenario()
      const base = detectarAssinaturas({ transactions: txs, tags: TAGS, hoje: HOJE })
      // ignora alguns itens para exercitar também a lista de ignorados
      const chaves = [...base.assinaturas, ...base.variaveis, ...base.recorrentesComuns].map(i => i.chave)
      const ignoradas = chaves.filter(() => rnd() < 0.2)
      const app = detectarAssinaturas({ transactions: txs, tags: TAGS, ignoradas, hoje: HOJE })
      const bot = detectarAssinaturasBot({ transactions: txs, tags: TAGS, ignoradas, hoje: HOJE })
      expect(JSON.stringify(bot), `cenário ${k}`).toBe(JSON.stringify(app))
    }
  })

  it('os cenários exercitam assinaturas, variáveis, recorrentes comuns e ignorados', () => {
    semente = 20261014
    let ass = 0, vari = 0, com = 0, ign = 0
    for (let k = 0; k < 300; k++) {
      const txs = gerarCenario()
      const r = detectarAssinaturas({ transactions: txs, tags: TAGS, hoje: HOJE })
      ass += r.assinaturas.length; vari += r.variaveis.length; com += r.recorrentesComuns.length
      const chaves = [...r.assinaturas, ...r.variaveis, ...r.recorrentesComuns].map(i => i.chave)
      ign += detectarAssinaturas({ transactions: txs, tags: TAGS, ignoradas: chaves.slice(0, 1), hoje: HOJE }).ignoradosCount
    }
    expect(ass).toBeGreaterThan(30)
    expect(vari).toBeGreaterThan(10)
    expect(com).toBeGreaterThan(10)
    expect(ign).toBeGreaterThan(10)
  })

  it('dados de demonstração dão o mesmo resultado nos dois lados', () => {
    const d = criarDadosDemo(HOJE)
    const app = detectarAssinaturas({ transactions: d.transactions, tags: d.config.tags, hoje: HOJE })
    const bot = detectarAssinaturasBot({ transactions: d.transactions, tags: d.config.tags, hoje: HOJE })
    expect(JSON.stringify(bot)).toBe(JSON.stringify(app))
  })
})

// ── /assinaturas pelo Telegram ─────────────────────────────────────────────────
function semearDemo(configExtra = {}) {
  const d = criarDadosDemo(HOJE)
  fake.seed(`users/${UID}`, { telegramChatId: String(CHAT) })
  fake.seed(`config/${UID}`, { ...d.config, ...configExtra })
  d.transactions.forEach(t => fake.seed(`transactions/${UID}/entries/${t.id}`, t))
}
const pergunta = async (texto = '/assinaturas') => {
  await enviarAoBot(mensagemTelegram(texto))
  return mensagensEnviadas().join('\n')
}

describe('/assinaturas no Telegram', () => {
  beforeEach(() => { fake.limpar(); instalarTelegramFalso() })

  it('lista assinaturas do cartão, recorrentes de Pix/débito e os totais', async () => {
    semearDemo()
    const t = await pergunta()
    expect(t).toContain('Assinaturas e recorrentes')
    expect(t).toContain('No cartão')
    expect(t).toContain('R$ 236,59/mês')
    expect(t).toContain('R$ 2.839,08/ano')
    for (const nome of ['Academia', 'Netflix', 'Disney+', 'Spotify', 'Google One']) expect(t).toContain(nome)
    expect(t).toContain('Pix/débito')
    expect(t).toContain('Aluguel')
    expect(t).toContain('Total fixo por mês')
    expect(t).toContain('R$ 2.616,49')
  })

  it('marca reajuste com a seta e o valor antigo, e a tag com 🏷', async () => {
    semearDemo()
    const t = await pergunta()
    expect(t).toMatch(/Spotify[^\n]*27,90[^\n]*▲[^\n]*era R\$ 21,90/)
    expect(t).toMatch(/Netflix 🏷/)
  })

  it('avisa dos itens variáveis sem colocá-los no total', async () => {
    semearDemo()
    const t = await pergunta()
    expect(t).toContain('o valor varia')
    expect(t).not.toContain('iFood')
  })

  it('item ocultado no app (config.assinaturasIgnoradas) não aparece no Telegram', async () => {
    semearDemo({ assinaturasIgnoradas: ['c1|academia', 'rec:alu'] })
    const t = await pergunta()
    expect(t).not.toContain('Academia')
    expect(t).not.toContain('Aluguel')
    expect(t).toContain('Netflix')
  })

  it('sem nada recorrente explica e sugere a tag', async () => {
    fake.seed(`users/${UID}`, { telegramChatId: String(CHAT) })
    fake.seed(`config/${UID}`, {})
    const t = await pergunta()
    expect(t).toContain('Nada recorrente encontrado')
    expect(t).toContain('Assinaturas')
  })

  it('o apelido /assinatura e o texto livre "assinaturas" também funcionam', async () => {
    semearDemo()
    expect(await pergunta('/assinatura')).toContain('No cartão')
    fake.limpar(); instalarTelegramFalso(); semearDemo()
    expect(await pergunta('🔁 Assinaturas')).toContain('No cartão')
  })

  it('só lê: não grava nada ao consultar', async () => {
    semearDemo()
    const antes = JSON.stringify(fake.lista(`transactions/${UID}/entries`))
    await pergunta()
    expect(JSON.stringify(fake.lista(`transactions/${UID}/entries`))).toBe(antes)
  })
})
