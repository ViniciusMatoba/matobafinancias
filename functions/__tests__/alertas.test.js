import { describe, it, expect } from 'vitest'
import { bot, fixarRelogio, HOJE } from './helpers'

fixarRelogio()

const TODOS = Array.from({ length: 25 }, (_, i) => `n${i + 1}`)
/** Liga só os alertas pedidos (os demais ficam desligados) para isolar cada cenário. */
const so = (...ligados) => ({
  tipos: Object.fromEntries(TODOS.map(n => [n, ligados.includes(n)])),
})
const roda = (alertas, { txs = [], cards = [], config = {}, goals = [], wallet = 0 } = {}) =>
  bot.checkNotifications(cards, txs, config, so(...alertas), goals, wallet)

let seq = 0
const saida = (valor, categoria, extra = {}) => ({
  id: `s${++seq}`, tipo: 'saida', frequencia: 'unico', dataInicio: '2026-10-08',
  descricao: 'Compra', valor, categoria, ...extra,
})
const entrada = (valor, extra = {}) => ({
  id: `e${++seq}`, tipo: 'entrada', frequencia: 'unico', dataInicio: '2026-10-01',
  descricao: 'Salário', valor, ...extra,
})

const CFG = { rendaMensal: 10000, budgetPcts: { custos_fixos: 30, liberdade: 10 } }

describe('N4/N5 — orçamento por categoria', () => {
  it('N4: entre 80% e 100% avisa e traz estado por faixa', () => {
    const m = roda(['n4', 'n5'], { txs: [saida(2500, 'custos_fixos')], config: CFG })
    expect(m).toHaveLength(1)
    expect(m[0].text).toContain('Custos Fixos em 83%')
    expect(m[0].estado).toEqual({ chave: 'orc:2026-10:custos_fixos', sig: '4:8' })
  })
  it('N5: acima de 100% avisa que estourou', () => {
    const m = roda(['n4', 'n5'], { txs: [saida(3500, 'custos_fixos')], config: CFG })
    expect(m[0].text).toContain('Custos Fixos estourou')
    expect(m[0].estado.sig).toBe('5:11')
  })
  it('abaixo de 80% não avisa', () => {
    expect(roda(['n4', 'n5'], { txs: [saida(1000, 'custos_fixos')], config: CFG })).toHaveLength(0)
  })
  it('N5 desligado: gasto acima de 100% não avisa', () => {
    expect(roda(['n4'], { txs: [saida(3500, 'custos_fixos')], config: CFG })).toHaveLength(0)
  })
  it('sem renda configurada não avisa', () => {
    expect(roda(['n4', 'n5'], { txs: [saida(3500, 'custos_fixos')], config: {} })).toHaveLength(0)
  })
  it('Liberdade Financeira acima de 100% é meta superada, não estouro', () => {
    const m = roda(['n4', 'n5'], { txs: [saida(1200, 'liberdade')], config: CFG })
    expect(m).toHaveLength(1)
    expect(m[0].text).toContain('Meta de Liberdade Financeira superada')
    expect(m[0].text).not.toContain('estourou')
  })
  it('Liberdade entre 80% e 100% é "meta em X%"', () => {
    const m = roda(['n4', 'n5'], { txs: [saida(900, 'liberdade')], config: CFG })
    expect(m[0].text).toContain('Meta de Liberdade Financeira em 90%')
  })
})

describe('N6 — saldo negativo', () => {
  it('saldo atual negativo é urgente e repete a cada 3 dias', () => {
    const m = roda(['n6'], { txs: [entrada(100), saida(500, 'custos_fixos', { dataInicio: HOJE })] })
    expect(m[0].text).toContain('Saldo atual negativo')
    expect(m[0].estado.chave).toBe('saldo-negativo')
    expect(m[0].estado.repetirDias).toBe(3)
  })
  it('saldo hoje positivo mas negativo em 7 dias avisa a projeção', () => {
    const m = roda(['n6'], { txs: [entrada(100), saida(500, 'custos_fixos', { dataInicio: '2026-10-18' })] })
    expect(m[0].text).toContain('saldo pode ficar negativo')
    expect(m[0].estado.sig.startsWith('proj:')).toBe(true)
  })
  it('saldo positivo não avisa', () => {
    expect(roda(['n6'], { txs: [entrada(5000)] })).toHaveLength(0)
  })
})

describe('N9 — limite geral de gastos', () => {
  const cfg = { rendaMensal: 5000 }
  it('90% da renda: avisa com faixa 9', () => {
    const m = roda(['n9'], { txs: [saida(4500, 'conforto')], config: cfg })
    expect(m[0].text).toContain('Limite Geral em 90%')
    expect(m[0].estado).toEqual({ chave: 'limite-geral:2026-10', sig: '9' })
  })
  it('acima de 100%: ultrapassado', () => {
    const m = roda(['n9'], { txs: [saida(5600, 'conforto')], config: cfg })
    expect(m[0].text).toContain('Limite Geral Ultrapassado')
  })
  it('gasto baixo não avisa', () => {
    expect(roda(['n9'], { txs: [saida(1000, 'conforto')], config: cfg })).toHaveLength(0)
  })
})

describe('N11 — limite do cartão', () => {
  const card = { id: 'c1', nome: 'Nubank', diaVencimento: 20, diaFechamento: 13, limite: 1000 }
  const faturaDe = (valor) => ({
    id: 'f', tipo: 'cartao', frequencia: 'unico', cartaoId: 'c1', descricao: 'Fatura',
    dataInicio: '2026-11-20', valor,
    itens: [{ descricao: 'Compra', valor, categoria: 'conforto', dataCompra: '2026-10-10' }],
  })
  it('80% ou mais do limite comprometido avisa', () => {
    const m = roda(['n11'], { cards: [card], txs: [faturaDe(900)] })
    expect(m).toHaveLength(1)
    expect(m[0].text).toContain('Limite de Cartão próximo do fim')
    expect(m[0].estado.chave).toBe('cartao-limite:c1')
  })
  it('uso baixo não avisa', () => {
    expect(roda(['n11'], { cards: [card], txs: [faturaDe(200)] })).toHaveLength(0)
  })
})

describe('N22 — sobra projetada segura', () => {
  it('com sobra acima de R$ 200 informa o valor investível', () => {
    const m = roda(['n22'], { txs: [entrada(3000)] })
    expect(m).toHaveLength(1)
    expect(m[0].text).toContain('pode guardar ou investir')
    expect(m[0].estado.chave).toBe('sobra-segura')
  })
  it('abaixo de R$ 200 não oferece valor para investir e aponta a próxima janela', () => {
    const txs = [entrada(150), entrada(5000, { dataInicio: '2026-10-25' })]
    const m = roda(['n22'], { txs })
    expect(m).toHaveLength(1)
    expect(m[0].text).toContain('Hoje não há valor seguro para investir')
    expect(m[0].text).toContain('A partir de 25/10')
  })
  it('sem sobra hoje e sem janela futura: não manda nada', () => {
    expect(roda(['n22'], { txs: [entrada(100)] })).toHaveLength(0)
  })
})

describe('dedupe em vários dias (filtrarAlertasRepetidos + estadoAposEnvio)', () => {
  const aviso = (sig, extra = {}) => ({ text: 'x', estado: { chave: 'k', sig, ...extra } })
  const dia = (n) => `2026-10-${String(n).padStart(2, '0')}`

  it('mesmo aviso não repete no dia seguinte; mudar a faixa reenvia', () => {
    const d1 = bot.filtrarAlertasRepetidos([aviso('4:8')], {}, dia(14))
    expect(d1.enviar).toHaveLength(1)
    const d2 = bot.filtrarAlertasRepetidos([aviso('4:8')], d1.estadoNovo, dia(15))
    expect(d2.enviar).toHaveLength(0)
    const d3 = bot.filtrarAlertasRepetidos([aviso('4:9')], d2.estadoNovo, dia(16))
    expect(d3.enviar).toHaveLength(1)
  })
  it('aviso urgente repete a cada 3 dias', () => {
    const u = () => aviso('atual:-5', { repetirDias: 3 })
    const d1 = bot.filtrarAlertasRepetidos([u()], {}, dia(10))
    const d2 = bot.filtrarAlertasRepetidos([u()], d1.estadoNovo, dia(12))
    const d3 = bot.filtrarAlertasRepetidos([u()], d2.estadoNovo, dia(13))
    expect(d2.enviar).toHaveLength(0)
    expect(d3.enviar).toHaveLength(1)
  })
  it('condição que some e volta reavisa', () => {
    const d1 = bot.filtrarAlertasRepetidos([aviso('a')], {}, dia(10))
    const d2 = bot.filtrarAlertasRepetidos([], d1.estadoNovo, dia(11))
    expect(d2.estadoNovo).toEqual({})
    expect(bot.filtrarAlertasRepetidos([aviso('a')], d2.estadoNovo, dia(12)).enviar).toHaveLength(1)
  })
  it('avisos sem estado sempre são enviados', () => {
    const r = bot.filtrarAlertasRepetidos([{ text: 'fatura vence hoje' }, 'texto puro'], {}, dia(10))
    expect(r.enviar).toHaveLength(2)
  })
  it('envio que falhou não fica marcado como avisado', () => {
    const d1 = bot.filtrarAlertasRepetidos([aviso('a')], {}, dia(10))
    const salvo = bot.estadoAposEnvio(d1.estadoNovo, {}, new Set(['k']))
    expect(salvo).toEqual({})
    expect(bot.filtrarAlertasRepetidos([aviso('a')], salvo, dia(11)).enviar).toHaveLength(1)
  })
  it('falha preserva o estado anterior da mesma chave', () => {
    const ant = { k: { sig: 'a', data: dia(9) } }
    const d = bot.filtrarAlertasRepetidos([aviso('b')], ant, dia(10))
    expect(bot.estadoAposEnvio(d.estadoNovo, ant, new Set(['k']))).toEqual(ant)
  })
})
