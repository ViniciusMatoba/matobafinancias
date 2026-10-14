import { describe, it, expect, beforeEach } from 'vitest'
import {
  bot, fake, UID, fixarRelogio, instalarTelegramFalso, enviarAoBot, botaoTelegram, chamadasTelegram,
  criarUsuario, lancamento, lancamentos,
} from './helpers'

/**
 * Botão Pago do cartão (alerta de vencimento sem fatura lançada): paga a fatura da data do alerta com as
 * mesmas gravações do app e nunca cria pagamento zerado. Hoje = 10/11/2026 (dia de vencimento do cartão).
 */
fixarRelogio('2026-11-10T15:00:00Z')
const HOJE = '2026-11-10'
const card = { id: 'c1', nome: 'Nubank', diaVencimento: 10, diaFechamento: 3, limite: 5000 }

const tv = (k, extra = {}) => ({
  descricao: 'TV', valor: 200, categoria: 'conforto', dataCompra: '2026-07-20',
  isParcelado: true, parcelaAtual: k, totalParcelas: 6, ...extra,
})
const fatura = (id, dataInicio, itens, extra = {}) => lancamento(id, {
  tipo: 'cartao', frequencia: 'unico', cartaoId: 'c1', descricao: 'Fatura', dataInicio,
  valor: itens.reduce((s, i) => s + i.valor, 0), itens, ...extra,
})
const caixaFuturo = () => bot.calcSaldoSimples(lancamentos(), '2030-12-31', 0)
const pendenteEm = (data) => bot.expandRange(lancamentos().filter(t => t.tipo === 'cartao'), data, data)
  .filter(o => o.date === data && !o.tx.conferido).reduce((a, o) => a + o.valor, 0)
const clicar = (data = HOJE) => enviarAoBot(botaoTelegram(`paycard:c1:${data}`))
const edicoes = () => chamadasTelegram.filter(c => c.metodo === 'editMessageText').map(c => c.text)
const originais = (antes) => lancamentos().filter(l => antes.has(l.id))

beforeEach(() => {
  fake.limpar()
  instalarTelegramFalso()
  criarUsuario()
  fake.seed(`cards/${UID}/list/c1`, card)
})

describe('Pago do cartão', () => {
  it('fatura JÁ PAGA que ainda projeta parcelas: quita a parcela do mês (antes criava pagamento de R$ 0)', async () => {
    fatura('f', '2026-10-10', [tv(4)], { conferido: true })
    expect(pendenteEm('2026-11-10')).toBe(200)
    const caixa = caixaFuturo()
    const antes = new Set(lancamentos().map(l => l.id))
    await clicar()

    const novos = lancamentos().filter(l => !antes.has(l.id))
    expect(novos).toHaveLength(1)
    expect(novos[0]).toMatchObject({ valor: 200, conferido: true, dataInicio: HOJE, cartaoId: 'c1' })
    expect(novos[0].itens.every(i => i.isParcelado === false)).toBe(true)
    expect(fake.ler(`transactions/${UID}/entries/f`).exclusoes).toEqual(['2026-11-10'])
    expect(pendenteEm('2026-11-10')).toBe(0)
    expect(caixaFuturo()).toBe(caixa) // o caixa não muda: a parcela só vira pagamento real
    expect(edicoes().join()).toContain('Fatura paga')
  })

  it('segundo clique não grava nada e avisa que já estava paga', async () => {
    fatura('f', '2026-10-10', [tv(4)], { conferido: true })
    await clicar()
    const depois1 = JSON.stringify(lancamentos())
    await clicar()
    expect(JSON.stringify(lancamentos())).toBe(depois1)
    expect(edicoes().at(-1)).toContain('já estava paga')
  })

  it('nunca cria pagamento zerado', async () => {
    fatura('f', '2026-10-10', [tv(6)], { conferido: true }) // sem parcelas futuras
    await clicar()
    expect(lancamentos()).toHaveLength(1)
    expect(edicoes().at(-1)).toContain('já estava paga')
  })

  it('fatura não paga com projeção: exclui a data no original e cria o pagamento', async () => {
    fatura('f', '2026-10-10', [tv(4)])
    const caixa = caixaFuturo()
    await clicar()
    expect(fake.ler(`transactions/${UID}/entries/f`).exclusoes).toContain('2026-11-10')
    expect(lancamentos().filter(l => l.id !== 'f')).toHaveLength(1)
    expect(caixaFuturo()).toBe(caixa)
  })

  it('fatura real pendente na data: ela mesma é quitada, sem pagamento por cima', async () => {
    fatura('g', HOJE, [{ descricao: 'Mercado', valor: 150, categoria: 'custos_fixos', dataCompra: '2026-10-20' }])
    const caixa = caixaFuturo()
    await clicar()
    expect(lancamentos()).toHaveLength(1)
    expect(fake.ler(`transactions/${UID}/entries/g`)).toMatchObject({ conferido: true, dataInicio: HOJE })
    expect(caixaFuturo()).toBe(caixa)
  })

  it('real e projetada na mesma data: quita as duas sem contar em dobro', async () => {
    fatura('f', '2026-10-10', [tv(4)], { conferido: true })
    fatura('g', HOJE, [{ descricao: 'Mercado', valor: 150, categoria: 'custos_fixos', dataCompra: '2026-10-20' }])
    const caixa = caixaFuturo()
    await clicar()
    expect(pendenteEm(HOJE)).toBe(0)
    expect(caixaFuturo()).toBe(caixa)
  })

  it('botão de alerta antigo (data sem nada pendente) não paga outro ciclo', async () => {
    fatura('f', '2026-10-10', [tv(4)], { conferido: true })
    const antes = JSON.stringify(lancamentos())
    await clicar('2026-10-10') // alerta de outubro, que já foi pago
    expect(JSON.stringify(lancamentos())).toBe(antes)
    expect(edicoes().at(-1)).toContain('já estava paga')
  })

  it('só mexe no cartão do botão', async () => {
    fatura('f', '2026-10-10', [tv(4)], { conferido: true })
    lancamento('x', { tipo: 'cartao', frequencia: 'unico', cartaoId: 'outro', descricao: 'Outro', dataInicio: HOJE, valor: 90,
      itens: [{ descricao: 'Y', valor: 90, categoria: 'conforto', dataCompra: '2026-10-30' }] })
    await clicar()
    expect(fake.ler(`transactions/${UID}/entries/x`).conferido).toBeUndefined()
  })

  it('cartão inexistente não grava nada', async () => {
    fatura('f', '2026-10-10', [tv(4)], { conferido: true })
    const antes = JSON.stringify(lancamentos())
    await enviarAoBot(botaoTelegram('paycard:naoexiste:2026-11-10'))
    expect(JSON.stringify(lancamentos())).toBe(antes)
  })

  it('depois de pagar, /fatura do app-cálculo avança para o próximo ciclo', async () => {
    fatura('f', '2026-10-10', [tv(4)], { conferido: true })
    expect(bot.calcFaturaCardApp(card, lancamentos(), HOJE).faturaAtual).toBe(200)
    await clicar()
    const r = bot.calcFaturaCardApp(card, lancamentos(), HOJE)
    expect(r.proximoVenc).toBe('2026-12-10')
  })
})

describe('alertas N1 e N2: data do botão', () => {
  const alertas = (txs, tipos, extra = {}) =>
    bot.checkNotifications([card], txs, {}, { tipos: { ...Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`n${i + 1}`, false])), ...tipos }, ...extra }, [], 0)
  const txCartao = (id, dataInicio, extra = {}) => ({
    id, tipo: 'cartao', frequencia: 'unico', cartaoId: 'c1', descricao: 'F', dataInicio, valor: 100,
    itens: [{ descricao: 'A', valor: 100, categoria: 'conforto', dataCompra: '2026-10-20' }], ...extra,
  })

  it('N1: usa a fatura real que vence HOJE e a data de hoje', () => {
    const [m] = alertas([txCartao('hoje', HOJE), txCartao('prox', '2026-12-10')], { n1: true })
    expect(m).toMatchObject({ txId: 'hoje', occDate: HOJE })
  })
  it('N1: sem fatura lançada hoje vai pelo cartão (virtual) com a data de hoje, mesmo havendo a do mês seguinte', () => {
    const [m] = alertas([txCartao('prox', '2026-12-10')], { n1: true })
    expect(m).toMatchObject({ txId: 'virtual:c1', occDate: HOJE })
  })
  it('N1: fatura de hoje já paga não é oferecida para pagar de novo', () => {
    const [m] = alertas([txCartao('hoje', HOJE, { conferido: true })], { n1: true })
    expect(m.txId).toBe('virtual:c1')
  })
  it('N2: a data do botão é o vencimento anunciado (hoje + X dias)', () => {
    const [m] = alertas([txCartao('v', '2026-11-13')], { n2: true }, { diasAntecedenciaVencimento: [3] })
    // 10/11 + 3 dias = 13/11, mas o cartão vence no dia 10: nada a anunciar
    expect(m).toBeUndefined()
    const cardDia13 = { ...card, diaVencimento: 13 }
    const [n] = bot.checkNotifications([cardDia13], [txCartao('v', '2026-11-13')], {}, { tipos: { n2: true }, diasAntecedenciaVencimento: [3] }, [], 0)
    expect(n).toMatchObject({ txId: 'v', occDate: '2026-11-13' })
  })
})
