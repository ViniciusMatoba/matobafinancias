import { describe, it, expect } from 'vitest'
import { detectarAssinaturas, chaveDescricao } from '../assinaturas'
import { criarDadosDemo } from '../../demo/dados'

const HOJE = '2026-10-14'
const tags = [{ id: 'assinaturas', label: 'Assinaturas', cor: '#8b5cf6' }, { id: 'mercado', label: 'Mercado', cor: '#10b981' }]

let seq = 0
/** Uma fatura (unica) com os itens dados, no vencimento `venc`. */
const fatura = (venc, itens, extra = {}) => ({
  id: `f${++seq}`, tipo: 'cartao', frequencia: 'unico', cartaoId: 'c1', descricao: 'Fatura', dataInicio: venc,
  valor: itens.reduce((s, i) => s + i.valor, 0), itens, ...extra,
})
const item = (descricao, valor, dataCompra, extra = {}) => ({ descricao, valor, categoria: 'prazeres', dataCompra, ...extra })
/** Item mensal: um por mês nas datas dadas. */
const mensal = (descricao, valores, dia, extra = {}) => valores.map(([mes, valor]) =>
  fatura(`${mes}-10`, [item(descricao, valor, `${mes}-${String(dia).padStart(2, '0')}`, extra)]))

const detectar = (transactions, extra = {}) => detectarAssinaturas({ transactions, tags, hoje: HOJE, ...extra })
const nomes = (lista) => lista.map(a => a.nome)

describe('chaveDescricao', () => {
  it.each([
    ['Netflix', 'netflix'],
    ['NETFLIX 10/12', 'netflix'],
    ['Uber *TRIP 1234', 'uber trip'],
    ['Spotify (3/6)', 'spotify'],
    ['PAG*Disney+', 'pag disney+'],
    ['  Google   One  ', 'google one'],
    ['Água e Luz', 'agua e luz'],
  ])('%s -> %s', (entrada, esperado) => {
    expect(chaveDescricao(entrada)).toBe(esperado)
  })
  it('vazio e só números viram vazio', () => {
    expect(chaveDescricao('')).toBe('')
    expect(chaveDescricao('12345')).toBe('')
    expect(chaveDescricao(undefined)).toBe('')
  })
})

describe('assinaturas no cartão', () => {
  const sub = (valores) => mensal('Netflix', valores, 5)

  it('mesma descrição, uma vez por mês e valor igual em meses seguidos: é assinatura', () => {
    const r = detectar(sub([['2026-08', 40], ['2026-09', 40], ['2026-10', 40]]))
    expect(nomes(r.assinaturas)).toEqual(['Netflix'])
    expect(r.assinaturas[0]).toMatchObject({ valorAtual: 40, meses: 3, marcada: false, ultimoReajuste: null })
  })

  it('só um mês: ainda não é assinatura (precisa repetir)', () => {
    expect(detectar(sub([['2026-10', 40]])).assinaturas).toHaveLength(0)
  })

  it('meses alternados (com buraco) não contam como seguidos', () => {
    expect(detectar(sub([['2026-06', 40], ['2026-08', 40], ['2026-10', 40]])).assinaturas).toHaveLength(0)
  })

  it('um reajuste na janela continua sendo assinatura e registra o último reajuste', () => {
    const r = detectar(sub([['2026-06', 21.9], ['2026-07', 21.9], ['2026-08', 21.9], ['2026-09', 27.9], ['2026-10', 27.9]]))
    expect(r.assinaturas[0]).toMatchObject({ valorAtual: 27.9, ultimoReajuste: { mes: '2026-09', de: 21.9, para: 27.9 } })
  })

  it('variação dentro da tolerância (até 5%) não é reajuste', () => {
    const r = detectar(sub([['2026-08', 100], ['2026-09', 103], ['2026-10', 104]]))
    expect(r.assinaturas[0].ultimoReajuste).toBeNull()
  })

  it('valor que oscila todo mês vira "variável", e fica fora dos totais', () => {
    const r = detectar(mensal('Mercado Central', [['2026-06', 310], ['2026-07', 420], ['2026-08', 280], ['2026-09', 390], ['2026-10', 330]], 5))
    expect(r.assinaturas).toHaveLength(0)
    expect(nomes(r.variaveis)).toEqual(['Mercado Central'])
    expect(r.totais.mensalCartao).toBe(0)
    expect(r.totais.variaveisMensal).toBe(346)
  })

  it('várias compras no mesmo mês (iFood, Uber) são variáveis, nunca assinatura', () => {
    const ifood = ['2026-08', '2026-09', '2026-10'].map(m => fatura(`${m}-10`, [item('iFood', 40, `${m}-05`), item('iFood', 40, `${m}-12`)]))
    const r = detectar(ifood)
    expect(r.assinaturas).toHaveLength(0)
    expect(nomes(r.variaveis)).toEqual(['iFood'])
    expect(r.variaveis[0].media).toBe(80) // soma por mês
  })

  it('descrição com números e marcadores variáveis ainda agrupa', () => {
    const txs = [
      fatura('2026-09-10', [item('SPOTIFY 09/26', 21.9, '2026-09-04')]),
      fatura('2026-10-10', [item('Spotify 10/26', 21.9, '2026-10-04')]),
    ]
    expect(detectar(txs).assinaturas).toHaveLength(1)
  })

  it('cobrança que desliza entre dia 31 e dia 1 continua no mês certo', () => {
    const txs = [
      fatura('2026-08-10', [item('Plano X', 50, '2026-07-31')]),
      fatura('2026-09-10', [item('Plano X', 50, '2026-09-01')]),   // desceu para o dia 1 do mês seguinte ao esperado
      fatura('2026-10-10', [item('Plano X', 50, '2026-09-30')]),
    ]
    const r = detectar(txs)
    expect(nomes(r.assinaturas)).toEqual(['Plano X'])
  })

  it('assinatura cancelada (sem aparecer há mais de 2 meses) sai da lista', () => {
    expect(detectar(sub([['2026-03', 40], ['2026-04', 40], ['2026-05', 40]])).assinaturas).toHaveLength(0)
  })

  it('tag "Assinaturas" inclui o item mesmo com uma única ocorrência', () => {
    const r = detectar([fatura('2026-10-10', [item('Curso online', 99, '2026-10-02', { tag: 'assinaturas' })])])
    expect(r.assinaturas[0]).toMatchObject({ nome: 'Curso online', marcada: true, valorAtual: 99 })
  })

  it('tag Assinaturas inclui mesmo se o valor oscila', () => {
    const txs = mensal('Cloud', [['2026-07', 10], ['2026-08', 25], ['2026-09', 12], ['2026-10', 40]], 5, { tag: 'assinaturas' })
    expect(nomes(detectar(txs).assinaturas)).toEqual(['Cloud'])
  })

  it('outra tag não força inclusão', () => {
    const r = detectar([fatura('2026-10-10', [item('Padaria', 20, '2026-10-02', { tag: 'mercado' })])])
    expect(r.assinaturas).toHaveLength(0)
  })

  it('parcelas nunca são assinatura', () => {
    const txs = ['2026-08', '2026-09', '2026-10'].map((m, i) =>
      fatura(`${m}-10`, [item('TV', 200, '2026-06-02', { isParcelado: true, parcelaAtual: 2 + i, totalParcelas: 6 })]))
    const r = detectar(txs)
    expect(r.assinaturas).toHaveLength(0)
    expect(r.variaveis).toHaveLength(0)
  })

  it('itens ignorados pelo usuário somem e são contados', () => {
    const txs = sub([['2026-08', 40], ['2026-09', 40], ['2026-10', 40]])
    const r = detectar(txs, { ignoradas: ['c1|netflix'] })
    expect(r.assinaturas).toHaveLength(0)
    expect(r.ignoradosCount).toBe(1)
  })

  it('o mesmo serviço em dois cartões fica separado', () => {
    const outro = mensal('Netflix', [['2026-09', 40], ['2026-10', 40]], 5).map(f => ({ ...f, cartaoId: 'c2' }))
    const r = detectar([...sub([['2026-09', 40], ['2026-10', 40]]), ...outro])
    expect(r.assinaturas).toHaveLength(2)
    expect(r.totais.mensalCartao).toBe(80)
  })

  it('compras futuras (depois de hoje) não entram', () => {
    const txs = [
      fatura('2026-10-10', [item('Prime', 14.9, '2026-09-20')]),
      fatura('2026-11-10', [item('Prime', 14.9, '2026-10-20')]), // ainda não aconteceu
    ]
    expect(detectar(txs).assinaturas).toHaveLength(0)
  })

  it('sem lançamentos não quebra e devolve zeros', () => {
    const r = detectar([])
    expect(r.assinaturas).toEqual([])
    expect(r.totais.geralMensal).toBe(0)
  })

  it('ordena pelo maior valor', () => {
    const txs = [...mensal('Barato', [['2026-09', 10], ['2026-10', 10]], 5), ...mensal('Caro', [['2026-09', 90], ['2026-10', 90]], 6)]
    expect(nomes(detectar(txs).assinaturas)).toEqual(['Caro', 'Barato'])
  })
})

describe('recorrentes fora do cartão (Pix e débito)', () => {
  const rec = (id, extra) => ({ id, tipo: 'saida', frequencia: 'mensal', dataInicio: '2026-01-10', valor: 100, descricao: id, ...extra })

  it('saída mensal ativa entra com o valor mensal e o dia', () => {
    const r = detectar([rec('Internet', { valor: 129.9, dataInicio: '2026-01-12' })])
    expect(r.recorrentesComuns[0]).toMatchObject({ nome: 'Internet', valorMensal: 129.9, dia: 12, frequencia: 'mensal' })
    expect(r.totais.comunsMensal).toBe(129.9)
  })

  it('semanal vira equivalente mensal (×52÷12)', () => {
    const r = detectar([rec('Feira', { frequencia: 'semanal', valor: 60 })])
    expect(r.recorrentesComuns[0].valorMensal).toBe(260)
  })

  it('não entram: entradas, investimentos, gasto diário, único, encerrado e que ainda não começou', () => {
    const r = detectar([
      rec('salario', { tipo: 'entrada' }),
      rec('aporte', { tipo: 'investimento' }),
      rec('diario', { tipo: 'diario' }),
      rec('unico', { frequencia: 'unico' }),
      rec('encerrado', { dataFim: '2026-09-30' }),
      rec('futuro', { dataInicio: '2026-12-01' }),
      rec('Ajuste de saldo', {}),
    ])
    expect(r.recorrentesComuns).toHaveLength(0)
  })

  it('lançamento ignorado some', () => {
    const r = detectar([rec('Aluguel', { valor: 1800 })], { ignoradas: ['rec:Aluguel'] })
    expect(r.recorrentesComuns).toHaveLength(0)
    expect(r.ignoradosCount).toBe(1)
  })

  it('o total geral soma assinaturas do cartão e recorrentes comuns (variáveis ficam de fora)', () => {
    const txs = [...mensal('Netflix', [['2026-09', 40], ['2026-10', 40]], 5), rec('Internet', { valor: 100 })]
    const r = detectar(txs)
    expect(r.totais).toMatchObject({ mensalCartao: 40, anualCartao: 480, comunsMensal: 100, geralMensal: 140, geralAnual: 1680 })
  })
})

describe('dados de demonstração', () => {
  const r = detectarAssinaturas({ transactions: criarDadosDemo(HOJE).transactions, tags: criarDadosDemo(HOJE).config.tags, hoje: HOJE })

  it('assinaturas esperadas: Netflix, Spotify (reajustou), Academia, Google One e Disney+', () => {
    expect(nomes(r.assinaturas).sort()).toEqual(['Academia', 'Disney+', 'Google One', 'Netflix', 'Spotify'])
    const spotify = r.assinaturas.find(a => a.nome === 'Spotify')
    expect(spotify.ultimoReajuste).toMatchObject({ de: 21.9, para: 27.9 })
    expect(r.totais.mensalCartao).toBe(236.59)
  })

  it('variáveis: iFood, Uber e mercado; a TV parcelada fica de fora', () => {
    expect(nomes(r.variaveis).sort()).toEqual(['Mercado Central', 'Uber *TRIP', 'iFood'])
  })

  it('recorrentes comuns: aluguel, internet e plano de saúde', () => {
    expect(nomes(r.recorrentesComuns).sort()).toEqual(['Aluguel', 'Internet', 'Plano de saúde'])
    expect(r.totais.comunsMensal).toBe(2379.9)
  })
})
