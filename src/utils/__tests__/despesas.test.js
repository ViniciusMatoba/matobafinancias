import { describe, it, expect } from 'vitest'
import { expandDespesas, isParcelaItem, totaisPorCategoria } from '../despesas'

const mercado = (valor, dataCompra, descricao = 'Mercado') => ({ descricao, valor, categoria: 'custos_fixos', dataCompra })
const tv = (parcelaAtual, extra = {}) => ({
  descricao: 'TV', valor: 200, categoria: 'conforto', dataCompra: '2026-09-20',
  isParcelado: true, parcelaAtual, totalParcelas: 3, ...extra,
})
const fatura = (id, dataInicio, itens, extra = {}) => ({
  id, tipo: 'cartao', frequencia: 'unico', cartaoId: 'c1', descricao: 'Fatura', dataInicio,
  valor: itens.reduce((s, i) => s + i.valor, 0), itens, ...extra,
})

const MESES = ['2026-09', '2026-10', '2026-11', '2026-12']
const mes = (m) => [`${m}-01`, `${m}-31`]
// total por mês na competência
const porMes = (txs) => Object.fromEntries(MESES.map(m => [m, expandDespesas(txs, ...mes(m)).reduce((s, e) => s + e.valor, 0)]))

// Fatura que vence em 10/10 com compras de setembro: à vista R$100 (28/09) + parcela 1/3 da TV (20/09)
const f1 = fatura('f1', '2026-10-10', [mercado(100, '2026-09-28'), tv(1)])

describe('despesas por competência — cenário base', () => {
  it('à vista na data da compra; parcelas mês a mês a partir da data da compra', () => {
    expect(porMes([f1])).toEqual({ '2026-09': 300, '2026-10': 200, '2026-11': 200, '2026-12': 0 })
  })

  it('devolve data, parcela e se é projeção', () => {
    const eventos = expandDespesas([f1], '2026-09-01', '2026-12-31')
    expect(eventos.map(e => [e.date, e.valor, e.parcela, e.projetada])).toEqual([
      ['2026-09-20', 200, '1/3', false],
      ['2026-09-28', 100, null, false],
      ['2026-10-20', 200, '2/3', true],
      ['2026-11-20', 200, '3/3', true],
    ])
  })

  it('pagar a fatura em outro mês (dataInicio muda) NÃO muda as despesas', () => {
    const paga = fatura('f1', '2026-11-02', f1.itens, { conferido: true })
    expect(porMes([paga])).toEqual(porMes([f1]))
  })
})

describe('despesas por competência — fatura seguinte', () => {
  it('criada a partir da projeção (pai exclui 10/11; itens viram não parcelados): nada some nem duplica', () => {
    const pai = { ...f1, exclusoes: ['2026-11-10'] }
    const nov = fatura('f2', '2026-11-10', [mercado(100, '2026-10-25', 'Mercado B'), tv(2, { isParcelado: false })])
    expect(porMes([pai, nov])).toEqual({ '2026-09': 300, '2026-10': 300, '2026-11': 200, '2026-12': 0 })
  })

  it('lançada como nova sem excluir a projeção do pai: a mesma parcela conta uma vez só', () => {
    const nov = fatura('f2', '2026-11-10', [mercado(100, '2026-10-25', 'Mercado B'), tv(2)])
    expect(porMes([f1, nov])).toEqual({ '2026-09': 300, '2026-10': 300, '2026-11': 200, '2026-12': 0 })
  })

  it('quando a parcela existe real e projetada, vale a real (valor corrigido)', () => {
    const nov = fatura('f2', '2026-11-10', [tv(2, { valor: 250 })])
    const eventos = expandDespesas([f1, nov], '2026-10-01', '2026-10-31')
    expect(eventos.map(e => [e.parcela, e.valor, e.projetada])).toEqual([['2/3', 250, false]])
  })
})

describe('despesas por competência — itens e faturas especiais', () => {
  it('item convertido (isParcelado:false com parcela/total) conta só a própria parcela, sem projetar', () => {
    const conv = fatura('f2', '2026-11-10', [tv(2, { isParcelado: false })])
    expect(isParcelaItem(conv.itens[0])).toBe(true)
    const eventos = expandDespesas([conv], '2026-09-01', '2026-12-31')
    expect(eventos.map(e => [e.date, e.parcela])).toEqual([['2026-10-20', '2/3']])
  })

  it('compra no dia 31 cai no último dia dos meses curtos', () => {
    const jan = fatura('f1', '2026-02-10', [{ descricao: 'Sofá', valor: 100, categoria: 'conforto', dataCompra: '2026-01-31', isParcelado: true, parcelaAtual: 1, totalParcelas: 3 }])
    const eventos = expandDespesas([jan], '2026-01-01', '2026-03-31')
    expect(eventos.map(e => e.date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
  })

  it('fatura excluída tira o à vista e a parcela do próprio mês; as projetadas seguem, como no caixa', () => {
    const excluida = { ...f1, exclusoes: ['2026-10-10'] }
    expect(porMes([excluida])).toEqual({ '2026-09': 0, '2026-10': 200, '2026-11': 200, '2026-12': 0 })
  })

  it('item sem data da compra usa a data da fatura (parcelado: a da parcela)', () => {
    const sem = fatura('f1', '2026-11-10', [
      { descricao: 'Padaria', valor: 30, categoria: 'custos_fixos' },
      { descricao: 'Curso', valor: 50, categoria: 'conhecimento', isParcelado: true, parcelaAtual: 2, totalParcelas: 4 },
    ])
    const eventos = expandDespesas([sem], '2026-11-01', '2026-11-30')
    expect(eventos.map(e => [e.descricao, e.date]).sort()).toEqual([['Curso', '2026-11-10'], ['Padaria', '2026-11-10']])
  })

  it('fatura recorrente (mensal) conta os itens em cada ocorrência', () => {
    const rec = { ...fatura('r1', '2026-10-05', [{ descricao: 'Streaming', valor: 50, categoria: 'conforto', dataCompra: '2026-01-05' }]), frequencia: 'mensal' }
    expect(porMes([rec])).toEqual({ '2026-09': 0, '2026-10': 50, '2026-11': 50, '2026-12': 50 })
  })

  it('fatura só com valor total (sem itens) conta na data dela, sem categoria', () => {
    const total = { id: 't', tipo: 'cartao', frequencia: 'unico', cartaoId: 'c1', dataInicio: '2026-10-10', valor: 400 }
    const [e] = expandDespesas([total], '2026-10-01', '2026-10-31')
    expect(e).toMatchObject({ date: '2026-10-10', valor: 400, categoria: null, tipo: 'cartao' })
  })
})

describe('despesas por competência — demais lançamentos', () => {
  const txs = [
    { id: 'a', tipo: 'saida', frequencia: 'unico', descricao: 'Padaria', valor: 40, dataInicio: '2026-10-03', categoria: 'custos_fixos', tag: 'mercado' },
    { id: 'b', tipo: 'saida', frequencia: 'mensal', descricao: 'Aluguel', valor: 1000, dataInicio: '2026-09-05', categoria: 'custos_fixos' },
    { id: 'c', tipo: 'investimento', frequencia: 'unico', descricao: 'CDB', valor: 500, dataInicio: '2026-10-07' },
    { id: 'd', tipo: 'entrada', frequencia: 'unico', descricao: 'Salário', valor: 5000, dataInicio: '2026-10-01' },
    { id: 'e', tipo: 'saida', frequencia: 'parcelado', descricao: 'Geladeira', valor: 300, dataInicio: '2026-10-15', parcelaAtual: 1, totalParcelas: 3, categoria: 'conforto' },
  ]

  it('usa a data da própria ocorrência, ignora entrada e põe investimento em Liberdade', () => {
    const eventos = expandDespesas(txs, '2026-10-01', '2026-10-31')
    expect(eventos.map(e => [e.date, e.descricao, e.valor, e.categoria])).toEqual([
      ['2026-10-03', 'Padaria', 40, 'custos_fixos'],
      ['2026-10-05', 'Aluguel', 1000, 'custos_fixos'],
      ['2026-10-07', 'CDB', 500, 'liberdade'],
      ['2026-10-15', 'Geladeira', 300, 'conforto'],
    ])
    expect(eventos.find(e => e.descricao === 'Geladeira').parcela).toBe('1/3')
    expect(eventos.find(e => e.descricao === 'Padaria').tag).toBe('mercado')
  })

  it('totaisPorCategoria soma por categoria e usa "outros" quando falta', () => {
    const eventos = expandDespesas([...txs, { id: 'x', tipo: 'saida', frequencia: 'unico', descricao: 'Sem cat', valor: 10, dataInicio: '2026-10-09' }], '2026-10-01', '2026-10-31')
    expect(totaisPorCategoria(eventos)).toEqual({ custos_fixos: 1040, liberdade: 500, conforto: 300, outros: 10 })
  })

  it('só traz o que está dentro da janela', () => {
    expect(expandDespesas(txs, '2026-10-04', '2026-10-06').map(e => e.descricao)).toEqual(['Aluguel'])
  })
})
