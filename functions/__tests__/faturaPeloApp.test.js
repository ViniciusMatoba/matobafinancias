import { describe, it, expect, beforeEach } from 'vitest'
import {
  bot, fake, UID, fixarRelogio, instalarTelegramFalso, enviarAoBot, mensagemTelegram, ultimaMensagem,
  mensagensEnviadas, criarUsuario, lancamento,
} from './helpers'
import { calcFaturaCard } from '../../src/utils/projectionCalc'

/**
 * calcFaturaCardApp (usado por /fatura e pelo alerta N11) tem que dar exatamente os mesmos números que o
 * calcFaturaCard do app. Aqui rodam 400 cenários gerados (sempre os mesmos, semente fixa).
 */
fixarRelogio()

let semente = 12345
const rnd = () => (semente = (semente * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
const pick = (a) => a[Math.floor(rnd() * a.length)]

const CARTOES = [
  { id: 'c1', nome: 'A', diaVencimento: 10, diaFechamento: 3, limite: 8000 },
  { id: 'c1', nome: 'B', diaVencimento: 31, diaFechamento: 24, limite: 8000 }, // mês curto
  { id: 'c1', nome: 'C', diaVencimento: 5, diaFechamento: 28, limite: 8000 },  // vence antes de fechar
]

function cenario(card) {
  const txs = []
  const n = 1 + Math.floor(rnd() * 3)
  for (let i = 0; i < n; i++) {
    const mes = pick(['07', '08', '09', '10', '11'])
    const venc = `2026-${mes}-${String(Math.min(card.diaVencimento, 28)).padStart(2, '0')}`
    const total = pick([2, 3, 6, 10])
    const itens = [{ descricao: 'A', valor: 100, categoria: 'conforto', dataCompra: `2026-${mes}-01` }]
    if (rnd() < 0.7) {
      itens.push({ descricao: 'P', valor: 200, categoria: 'conforto', dataCompra: `2026-${mes}-02`,
        isParcelado: true, parcelaAtual: 1 + Math.floor(rnd() * 2), totalParcelas: total })
    }
    txs.push({
      id: `f${i}`, tipo: 'cartao', frequencia: 'unico', cartaoId: 'c1', descricao: 'F', dataInicio: venc,
      valor: itens.reduce((s, x) => s + x.valor, 0), itens, conferido: rnd() < 0.5,
      exclusoes: rnd() < 0.2 ? [`2026-${pick(['11', '12'])}-${String(Math.min(card.diaVencimento, 28)).padStart(2, '0')}`] : [],
      ...(rnd() < 0.15 ? { dataFim: '2026-12-31' } : {}),
    })
  }
  return txs
}

describe('calcFaturaCardApp × calcFaturaCard (400 cenários)', () => {
  const hojes = ['2026-10-02', '2026-10-05', '2026-10-14', '2026-10-28', '2026-11-12', '2026-12-01']
  it('zero divergências em fatura atual, comprometido, limite e vencimento', () => {
    const diferencas = []
    for (let k = 0; k < 400; k++) {
      const card = pick(CARTOES)
      const txs = cenario(card)
      const hoje = pick(hojes)
      const app = calcFaturaCard(card, txs, hoje)
      const b = bot.calcFaturaCardApp(card, txs, hoje)
      const a = [app.proximoVenc, app.faturaAtual, app.comprometidoFuturo, app.limiteDisponivel]
      const c = [b.proximoVenc, b.faturaAtual, b.comprometidoFuturo, b.limiteDisponivel]
      if (JSON.stringify(a) !== JSON.stringify(c)) diferencas.push({ k, card: card.diaVencimento, hoje, app: a, bot: c })
    }
    expect(diferencas.slice(0, 3)).toEqual([])
  })

  it('os 400 cenários exercitam fatura atual e comprometido de verdade (não são vazios)', () => {
    semente = 12345
    let comAtual = 0, comComp = 0
    for (let k = 0; k < 400; k++) {
      const card = pick(CARTOES); const txs = cenario(card); const hoje = pick(hojes)
      const r = calcFaturaCard(card, txs, hoje)
      if (r.faturaAtual > 0) comAtual++
      if (r.comprometidoFuturo > 0) comComp++
    }
    expect(comAtual).toBeGreaterThan(100)
    expect(comComp).toBeGreaterThan(100)
  })
})

describe('/fatura e N11 depois de pagar uma fatura parcelada', () => {
  const card = { nome: 'Nubank', diaVencimento: 10, diaFechamento: 3, limite: 1000 }
  const paga = {
    tipo: 'cartao', frequencia: 'unico', cartaoId: 'c1', descricao: 'Nubank', dataInicio: '2026-10-10', valor: 300,
    conferido: true,
    itens: [
      { descricao: 'Mercado', valor: 100, categoria: 'custos_fixos', dataCompra: '2026-09-28' },
      { descricao: 'TV', valor: 700, categoria: 'conforto', dataCompra: '2026-09-20', isParcelado: true, parcelaAtual: 1, totalParcelas: 3 },
    ],
  }

  beforeEach(() => { fake.limpar(); instalarTelegramFalso() })

  it('/fatura mostra as parcelas que a fatura paga ainda projeta', async () => {
    criarUsuario()
    fake.seed(`cards/${UID}/list/c1`, card)
    lancamento('f', paga)
    await enviarAoBot(mensagemTelegram('/fatura'))
    const t = mensagensEnviadas().join('\n')
    expect(t).toContain('11/2026'.replace('/', '/')) // vencimento do ciclo seguinte
    expect(t).toContain('TV')
    expect(t).toContain('2/3x')
    expect(t).toContain('R$ 700,00')
  })

  it('N11 considera as parcelas futuras de fatura paga no limite do cartão', () => {
    // limite 1000, fatura do ciclo 700 (TV 2/3) + 700 (TV 3/3) = 1400 -> acima de 80%
    const m = bot.checkNotifications([{ id: 'c1', ...card }], [{ id: 'f', ...paga }], {}, { tipos: { n11: true } }, [], 0)
    const textos = m.map(x => (typeof x === 'string' ? x : x.text))
    expect(textos.join('\n')).toContain('Limite de Cartão próximo do fim')
  })
})
