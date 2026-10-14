import { describe, it, expect } from 'vitest'
import { bot, fixarRelogio, HOJE } from './helpers'
import { expandOccurrences, calcSaldo, calcFaturaCard, resumirSobra, sobraPorData } from '../../src/utils/projectionCalc'
import { expandDespesas } from '../../src/utils/despesas'

/**
 * Paridade app × bot: os mesmos cenários rodam nos dois motores e os resultados precisam bater.
 * Se um teste daqui quebrar, o app e o bot passaram a calcular diferente.
 */
fixarRelogio()

const tx = (extra) => ({ id: 't', descricao: 'x', valor: 100, categoria: 'custos_fixos', ...extra })
const item = (valor, dataCompra, extra = {}) => ({ descricao: 'Item', valor, categoria: 'conforto', dataCompra, ...extra })
const tv = (parcelaAtual, extra = {}) => item(200, '2026-09-20', { descricao: 'TV', isParcelado: true, parcelaAtual, totalParcelas: 3, ...extra })
const fatura = (id, dataInicio, itens, extra = {}) => ({
  id, tipo: 'cartao', frequencia: 'unico', cartaoId: 'c1', descricao: 'Fatura', dataInicio,
  valor: itens.reduce((s, i) => s + i.valor, 0), itens, ...extra,
})

const f1 = fatura('f1', '2026-10-10', [item(100, '2026-09-28', { descricao: 'Mercado' }), tv(1)])

const CENARIOS = {
  'saída única': [tx({ tipo: 'saida', frequencia: 'unico', dataInicio: '2026-10-20', valor: 250 })],
  'entrada única': [tx({ tipo: 'entrada', frequencia: 'unico', dataInicio: '2026-10-05', valor: 5000 })],
  'fixo mensal dia 31 (meses curtos)': [tx({ tipo: 'saida', frequencia: 'mensal', dataInicio: '2026-01-31', valor: 80 })],
  'semanal': [tx({ tipo: 'saida', frequencia: 'semanal', dataInicio: '2026-09-01', valor: 30 })],
  'mensal com dataFim e exclusão': [tx({ tipo: 'saida', frequencia: 'mensal', dataInicio: '2026-06-10', dataFim: '2026-12-10', exclusoes: ['2026-08-10'], valor: 120 })],
  'investimento mensal': [tx({ tipo: 'investimento', frequencia: 'mensal', dataInicio: '2026-07-05', valor: 400 })],
  'fatura parcelada (vence 10/10)': [f1],
  'fatura paga em 02/11': [fatura('f1', '2026-11-02', f1.itens, { conferido: true })],
  'fatura de novembro criada da projeção': [
    { ...f1, exclusoes: ['2026-11-10'] },
    fatura('f2', '2026-11-10', [item(100, '2026-10-25', { descricao: 'Mercado' }), tv(2, { isParcelado: false })]),
  ],
  'mistura realista': [
    tx({ id: 'sal', tipo: 'entrada', frequencia: 'mensal', dataInicio: '2026-01-05', valor: 6000 }),
    tx({ id: 'alu', tipo: 'saida', frequencia: 'mensal', dataInicio: '2026-01-08', valor: 1800 }),
    tx({ id: 'inv', tipo: 'investimento', frequencia: 'mensal', dataInicio: '2026-01-06', valor: 500 }),
    f1,
  ],
}

const FROM = '2026-01-01'
const TO = '2027-03-31'

const ocApp = (txs, from, to, o) => txs.flatMap(t => expandOccurrences(t, from, to, o))
  .map(o => [o.date, o.valor * o.sinal]).sort()
const ocBot = (txs, from, to, o) => bot.expandRange(txs, from, to, o)
  .map(o => [o.date, o.valor * ({ entrada: 1 }[o.tipo] ?? -1)]).sort()

describe('paridade caixa: ocorrências', () => {
  for (const [nome, txs] of Object.entries(CENARIOS)) {
    it(nome, () => {
      expect(ocBot(txs, FROM, TO)).toEqual(ocApp(txs, FROM, TO))
    })
  }
})

describe('paridade caixa: saldo acumulado', () => {
  for (const [nome, txs] of Object.entries(CENARIOS)) {
    it(nome, () => {
      for (const ate of ['2026-09-30', HOJE, '2026-10-31', '2026-12-31', '2027-03-31']) {
        expect(bot.calcSaldoSimples(txs, ate, 1000), `${nome} até ${ate}`)
          .toBe(calcSaldo(txs, '2020-01-01', ate) + 1000)
      }
    })
  }
})

describe('paridade competência (despesas)', () => {
  const norm = (evs) => evs.map(e => [e.date ?? e.data, e.valor, e.categoria]).sort()
  for (const [nome, txs] of Object.entries(CENARIOS)) {
    it(nome, () => {
      expect(norm(bot.expandDespesasBot(txs, FROM, TO))).toEqual(norm(expandDespesas(txs, FROM, TO)))
    })
  }
  it('parcela repetida em duas faturas conta uma vez nos dois motores', () => {
    const txs = [
      fatura('a', '2026-10-10', [tv(1)]),
      fatura('b', '2026-11-10', [tv(2, { isParcelado: false })]),
    ]
    expect(norm(bot.expandDespesasBot(txs, FROM, TO))).toEqual(norm(expandDespesas(txs, FROM, TO)))
  })
})

describe('paridade sobra segura', () => {
  const series = {
    'abaixo do mínimo, sobe depois': [3, 3, 3, 3, 1500, 1500, 1500],
    'acima do mínimo': [900, 850, 800, 1200, 1300],
    'negativo no meio': [500, 100, -50, 700, 900],
    'sempre alto': [5000, 5000, 5000],
  }
  for (const [nome, saldos] of Object.entries(series)) {
    it(nome, () => {
      const serie = saldos.map((saldo, i) => ({ date: `2026-10-${String(14 + i).padStart(2, '0')}`, saldo }))
      const app = resumirSobra(serie)
      const b = bot.resumirSobraBot(serie)
      expect(b.hoje).toBe(app.hoje)
      expect(b.investivel).toBe(app.investivel)
      expect(b.proxima?.data).toBe(app.proxima?.data)
      expect(b.proxima?.valor).toBe(app.proxima?.valor)
      expect(bot.sobraPorDataBot(serie)).toEqual(sobraPorData(serie))
    })
  }
})

describe('regressão: ocorrências de hoje contam uma vez só na sobra segura', () => {
  it('saída de hoje não é descontada duas vezes', () => {
    const txs = [
      tx({ tipo: 'entrada', frequencia: 'unico', dataInicio: '2026-10-01', valor: 1000 }),
      tx({ tipo: 'saida', frequencia: 'unico', dataInicio: HOJE, valor: 300 }),
    ]
    const r = bot.calcSobraSeguraBot(txs, 0, HOJE, new Date('2026-10-14T12:00:00Z'))
    expect(r.investivel).toBe(700)
  })
})

describe('fatura do cartão: app × bot', () => {
  const card = { id: 'c1', nome: 'Nubank', diaVencimento: 10, diaFechamento: 3, limite: 5000 }

  it.each([
    ['antes do fechamento (02/10)', '2026-10-02', 300],
    ['depois do fechamento, antes do vencimento (05/10)', '2026-10-05', 200],
  ])('%s: vencimento e valor coincidem', (_, hoje, esperado) => {
    const app = calcFaturaCard(card, [f1], hoje)
    const b = bot.calcFaturaCardBot(card, [f1], hoje)
    expect(app.faturaAtual).toBe(esperado)
    expect(b.proximoVenc).toBe(app.proximoVenc)
    expect(b.faturaAtual).toBe(app.faturaAtual)
    expect(b.comprometidoFuturo).toBe(app.comprometidoFuturo)
  })

  describe('fatura vencida e não paga (regra de atraso, v1.6.116)', () => {
    const compara = (txs, hoje) => {
      const app = calcFaturaCard(card, txs, hoje)
      const b = bot.calcFaturaCardBot(card, txs, hoje)
      expect(b.proximoVenc).toBe(app.proximoVenc)
      expect(b.faturaAtual).toBe(app.faturaAtual)
      expect(b.comprometidoFuturo).toBe(app.comprometidoFuturo)
      expect(b.limiteDisponivel).toBe(app.limiteDisponivel)
      return app
    }

    it('continua mostrando a vencida em vez de pular para a próxima', () => {
      const app = compara([f1], HOJE)
      expect(app.proximoVenc).toBe('2026-10-10')
      expect(app.faturaAtual).toBe(300)
      expect(bot.calcFaturaCardBot(card, [f1], HOJE).proximoVenc).toBe('2026-10-10')
    })

    it('vence hoje e não foi paga: ainda é a fatura atual', () => {
      compara([f1], '2026-10-10')
    })

    it('depois de paga (conferida) deixa de ser atraso', () => {
      const paga = { ...f1, conferido: true }
      const app = calcFaturaCard(card, [paga], HOJE)
      const b = bot.calcFaturaCardBot(card, [paga], HOJE)
      expect(app.proximoVenc).toBe('2026-11-10')
      expect(b.proximoVenc).toBe('2026-11-10')
    })

    // DIVERGÊNCIA CONHECIDA (ainda não corrigida): as parcelas que uma fatura PAGA ainda projeta para os
    // meses seguintes (TV 2/3, 3/3). O app as conta na fatura do mês; o bot ignora lançamentos conferidos.
    it('parcelas futuras de uma fatura paga: app conta, bot não', () => {
      const paga = { ...f1, conferido: true }
      expect(calcFaturaCard(card, [paga], HOJE).faturaAtual).toBe(200)
      expect(bot.calcFaturaCardBot(card, [paga], HOJE).faturaAtual).toBe(0)
    })

    it('vencida com outra fatura já lançada no ciclo aberto', () => {
      const nov = fatura('f2', '2026-11-10', [item(150, '2026-10-06', { descricao: 'Farmácia' })])
      compara([f1, nov], HOJE)
    })

    it('cartão sem lançamento no vencimento anterior não é atraso', () => {
      const outra = fatura('f9', '2026-09-10', [item(80, '2026-08-20')], { conferido: true })
      compara([outra], HOJE)
    })
  })
})

describe('sanidade: os cenários não são vazios', () => {
  it('cada cenário gera ocorrências nos dois motores', () => {
    for (const [nome, txs] of Object.entries(CENARIOS)) {
      expect(ocApp(txs, FROM, TO).length, nome).toBeGreaterThan(0)
      expect(ocBot(txs, FROM, TO).length, nome).toBeGreaterThan(0)
    }
  })
})
