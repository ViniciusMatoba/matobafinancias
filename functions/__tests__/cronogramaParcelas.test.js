import { describe, it, expect, beforeEach } from 'vitest'
import { createRequire } from 'node:module'
import {
  fake, UID, CHAT, fixarRelogio, instalarTelegramFalso, enviarAoBot, mensagemTelegram, mensagensEnviadas,
} from './helpers'
import { calcParcelados, cronogramaParcelas } from '../../src/utils/parcelas'

const require = createRequire(import.meta.url)
const { calcParceladosBot, cronogramaParcelasBot } = require('../lib/motor/parcelados')

/**
 * Cronograma de parcelas (quando cada compra termina e quanto libera por mês): paridade app × bot e o texto do
 * /parcelados. Hoje = 14/10/2026. As datas são as do caixa (vencimento da fatura).
 */
fixarRelogio()
const HOJE = '2026-10-14'

// ── paridade ──────────────────────────────────────────────────────────────────
let semente = 777
const rnd = () => (semente = (semente * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
const pick = (a) => a[Math.floor(rnd() * a.length)]
const dd = (n) => String(n).padStart(2, '0')

function gerar() {
  const txs = []
  const nF = Math.floor(rnd() * 6)
  for (let i = 0; i < nF; i++) {
    const mes = pick(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'])
    const itens = []
    for (let j = 0; j < 1 + Math.floor(rnd() * 3); j++) {
      const parcelado = rnd() < 0.75
      itens.push({
        descricao: pick(['TV', 'Notebook', 'Sofá', 'Geladeira', 'Curso']), valor: pick([80, 150, 200, 500]), categoria: 'conforto',
        dataCompra: `${mes}-${dd(1 + Math.floor(rnd() * 27))}`,
        ...(parcelado ? { isParcelado: true, parcelaAtual: 1 + Math.floor(rnd() * 4), totalParcelas: pick([4, 6, 10, 12]) } : {}),
      })
    }
    txs.push({
      id: `f${i}`, tipo: 'cartao', frequencia: 'unico', cartaoId: pick(['c1', 'c1', 'c2']), descricao: 'Fatura', dataInicio: `${mes}-10`,
      valor: 100, itens, conferido: rnd() < 0.5,
      ...(rnd() < 0.15 ? { exclusoes: [`${pick(['2026-11', '2026-12'])}-10`] } : {}),
      ...(rnd() < 0.1 ? { dataFim: '2027-01-31' } : {}),
    })
  }
  for (let i = 0; i < Math.floor(rnd() * 3); i++) {
    txs.push({
      id: `a${i}`, tipo: 'saida', frequencia: 'parcelado', descricao: pick(['Sofá avulso', 'Moto', 'Reforma']), valor: pick([100, 300, 900]),
      dataInicio: pick(['2026-05-10', '2026-08-20', '2026-10-14', '2026-11-05']), parcelaAtual: 1, totalParcelas: pick([3, 6, 12]),
      ...(rnd() < 0.2 ? { conferido: true } : {}),
    })
  }
  return txs
}

describe('paridade app × bot — parcelas e cronograma', () => {
  it('300 cenários dão exatamente o mesmo resultado (itens, datas finais e cronograma)', () => {
    let comItens = 0, comVariasDatas = 0
    for (let k = 0; k < 300; k++) {
      const txs = gerar()
      const app = calcParcelados(txs, HOJE)
      const bot = calcParceladosBot(txs, HOJE)
      expect(JSON.stringify(bot), `itens ${k}`).toBe(JSON.stringify(app))
      const cApp = cronogramaParcelas(app)
      const cBot = cronogramaParcelasBot(bot)
      expect(JSON.stringify(cBot), `cronograma ${k}`).toBe(JSON.stringify(cApp))
      if (app.cartaoItems.length + app.avulsos.length > 0) comItens++
      if (cApp.liberacoes.length > 1) comVariasDatas++
    }
    expect(comItens).toBeGreaterThan(150)
    expect(comVariasDatas).toBeGreaterThan(50)
  })
})

// ── regras do cronograma ──────────────────────────────────────────────────────
const fatura = (id, venc, itens, extra = {}) => ({
  id, tipo: 'cartao', frequencia: 'unico', cartaoId: 'c1', descricao: 'Fatura', dataInicio: venc,
  valor: itens.reduce((s, i) => s + i.valor, 0), itens, ...extra,
})
const parc = (descricao, valor, k, total, extra = {}) => ({
  descricao, valor, categoria: 'conforto', dataCompra: '2026-07-02', isParcelado: true, parcelaAtual: k, totalParcelas: total, ...extra,
})

describe('cronogramaParcelas — regras', () => {
  it('a data final é a do caixa: parcela 4/6 em outubro termina em dezembro (4, 5 e 6)', () => {
    const r = calcParcelados([fatura('f', '2026-10-10', [parc('TV', 200, 4, 6)], { conferido: true })], HOJE)
    // a de outubro já passou (paga); restam 5/6 (nov) e 6/6 (dez)
    expect(r.cartaoItems[0]).toMatchObject({ parcelaAtual: 5, restam: 2, ultimaData: '2026-12-10' })
  })

  it('agrupa por mês de término e soma o que cada fim libera', () => {
    // a parcela de outubro já foi paga: Notebook (5/6) e Monitor (5/6) acabam em novembro; TV (4/6) em dezembro; Sofá (1/12) em set/2027
    const txs = [fatura('f', '2026-10-10', [parc('TV', 200, 4, 6), parc('Notebook', 500, 5, 6), parc('Monitor', 300, 5, 6), parc('Sofá', 100, 1, 12)], { conferido: true })]
    const c = cronogramaParcelas(calcParcelados(txs, HOJE))
    expect(c.liberacoes.map(l => [l.mes, l.libera])).toEqual([['2026-11', 800], ['2026-12', 200], ['2027-09', 100]])
    expect(c.liberacoes[0].itens).toEqual(['Notebook', 'Monitor']) // do maior para o menor valor
    expect(c.ultimaParcela).toBe('2027-09')
    expect(c.livreAPartirDe).toBe('2027-10')
  })

  it('parcelados avulsos entram no cronograma', () => {
    const avulso = { id: 'a', tipo: 'saida', frequencia: 'parcelado', descricao: 'Moto', valor: 900, dataInicio: '2026-07-20', parcelaAtual: 1, totalParcelas: 6 }
    const c = cronogramaParcelas(calcParcelados([avulso], HOJE))
    expect(c.liberacoes).toEqual([{ mes: '2026-12', itens: ['Moto'], libera: 900 }])
  })

  it('o peso mensal de hoje soma a parcela atual de cada item', () => {
    const txs = [fatura('f', '2026-10-10', [parc('TV', 200, 4, 6), parc('Notebook', 500, 5, 6)], { conferido: true })]
    expect(cronogramaParcelas(calcParcelados(txs, HOJE)).mensalHoje).toBe(700)
  })

  it('sem parcelas devolve vazio', () => {
    expect(cronogramaParcelas(calcParcelados([], HOJE))).toEqual({ mensalHoje: 0, liberacoes: [], ultimaParcela: null, livreAPartirDe: null })
  })

  it('virada de ano: última parcela em dezembro libera a partir de janeiro', () => {
    const c = cronogramaParcelas(calcParcelados([fatura('f', '2026-10-10', [parc('TV', 200, 1, 3)])], '2026-10-14'))
    // 1/3 em out (vencida e não paga), 2/3 nov, 3/3 dez
    expect(c.ultimaParcela).toBe('2026-12')
    expect(c.livreAPartirDe).toBe('2027-01')
  })
})

// ── /parcelados no Telegram ───────────────────────────────────────────────────
function semear(txs) {
  fake.seed(`users/${UID}`, { telegramChatId: String(CHAT) })
  fake.seed(`config/${UID}`, {})
  fake.seed(`cards/${UID}/list/c1`, { nome: 'Nubank', diaVencimento: 10, diaFechamento: 3, limite: 5000 })
  txs.forEach(t => fake.seed(`transactions/${UID}/entries/${t.id}`, t))
}
const parcelados = async () => { await enviarAoBot(mensagemTelegram('/parcelados')); return mensagensEnviadas().join('\n') }

describe('/parcelados mostra quando você fica livre', () => {
  beforeEach(() => { fake.limpar(); instalarTelegramFalso() })

  it('lista os términos, o que cada um libera e a data de ficar livre', async () => {
    semear([fatura('f', '2026-10-10', [parc('TV', 200, 4, 6), parc('Notebook', 500, 5, 6), parc('Monitor', 300, 5, 6), parc('Sofá', 100, 1, 12)], { conferido: true })])
    const t = await parcelados()
    expect(t).toContain('Quando você fica livre')
    expect(t).toContain('Hoje as parcelas pesam *R$ 1.100,00/mês*')
    expect(t).toContain('nov/2026 — acabam: Notebook, Monitor → libera *R$ 800,00/mês*')
    expect(t).toContain('dez/2026 — acaba: TV → libera *R$ 200,00/mês*')
    expect(t).toContain('set/2027 — acaba: Sofá → libera *R$ 100,00/mês*')
    expect(t).toContain('Última parcela em *set/2027*; livre a partir de *out/2027*')
    expect(t).toContain('se não fizer novas compras parceladas')
  })

  it('o texto antigo da lista continua igual (item, parcelas e total)', async () => {
    semear([fatura('f', '2026-10-10', [parc('TV', 200, 4, 6)], { conferido: true })])
    const t = await parcelados()
    expect(t).toContain('(5/6x)')
    expect(t).toContain('R$ 200,00/mês × 2 restantes = *R$ 400,00*')
    expect(t).toContain('Total ainda a pagar: R$ 400,00')
  })

  it('mais de 5 datas de término: mostra 5 e resume o resto', async () => {
    const itens = [3, 4, 5, 6, 7, 8, 9].map(total => parc(`Item${total}`, 50, 1, total + 1))
    semear([fatura('f', '2026-10-10', itens)])
    const t = await parcelados()
    expect(t).toMatch(/…e mais 2 datas de término/)
  })

  it('sem parcelas em aberto não tem a seção', async () => {
    semear([])
    const t = await parcelados()
    expect(t).toContain('Nenhuma compra parcelada em aberto')
    expect(t).not.toContain('Quando você fica livre')
  })

  it('só lê: não grava nada', async () => {
    semear([fatura('f', '2026-10-10', [parc('TV', 200, 4, 6)], { conferido: true })])
    const antes = JSON.stringify(fake.lista(`transactions/${UID}/entries`))
    await parcelados()
    expect(JSON.stringify(fake.lista(`transactions/${UID}/entries`))).toBe(antes)
  })
})
