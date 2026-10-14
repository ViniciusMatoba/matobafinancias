import { describe, it, expect } from 'vitest'
import { limiteDaTag, setTagLimit, statusLimite, limitesDoMes, computeTagStats, addTagToList } from '../tags'
import { expandDespesas } from '../despesas'

/** Limite mensal por tag: opcional, editável a qualquer momento. */

const tags = [
  { id: 'mercado', label: 'Mercado', cor: '#10b981', limite: 400 },
  { id: 'streaming', label: 'Streaming', cor: '#8b5cf6' },
  { id: 'transporte', label: 'Transporte', cor: '#3b82f6', limite: 100 },
]

describe('limiteDaTag', () => {
  it('devolve o limite quando existe e 0 quando não existe ou é inválido', () => {
    expect(limiteDaTag(tags[0])).toBe(400)
    expect(limiteDaTag(tags[1])).toBe(0)
    expect(limiteDaTag({ limite: 0 })).toBe(0)
    expect(limiteDaTag({ limite: -5 })).toBe(0)
    expect(limiteDaTag({ limite: 'abc' })).toBe(0)
    expect(limiteDaTag({ limite: '250.5' })).toBe(250.5)
    expect(limiteDaTag(undefined)).toBe(0)
  })
})

describe('setTagLimit — definir, mudar e remover a qualquer momento', () => {
  it('define o limite de uma tag que não tinha', () => {
    const r = setTagLimit(tags, 'streaming', 150)
    expect(r.find(t => t.id === 'streaming').limite).toBe(150)
  })

  it('muda o limite de uma tag que já tinha', () => {
    expect(setTagLimit(tags, 'mercado', 550.456).find(t => t.id === 'mercado').limite).toBe(550.46)
  })

  it.each([0, '', null, undefined, NaN, -10, 'abc'])('remove o limite quando o valor é %s', (vazio) => {
    const r = setTagLimit(tags, 'mercado', vazio)
    expect('limite' in r.find(t => t.id === 'mercado')).toBe(false)
  })

  it('não mexe nas outras tags nem no nome/cor, e não altera a lista original', () => {
    const copia = JSON.stringify(tags)
    const r = setTagLimit(tags, 'mercado', 999)
    expect(r.find(t => t.id === 'transporte')).toEqual(tags[2])
    expect(r.find(t => t.id === 'mercado')).toMatchObject({ label: 'Mercado', cor: '#10b981' })
    expect(JSON.stringify(tags)).toBe(copia)
  })

  it('id inexistente e lista inválida não quebram', () => {
    expect(setTagLimit(tags, 'nao-existe', 10)).toEqual(tags)
    expect(setTagLimit(undefined, 'x', 10)).toEqual([])
  })

  it('renomear a tag preserva o limite (a tela renomeia com spread)', () => {
    const renomeada = tags.map(t => (t.id === 'mercado' ? { ...t, label: 'Supermercado' } : t))
    expect(limiteDaTag(renomeada.find(t => t.id === 'mercado'))).toBe(400)
  })

  it('tag nova criada depois nasce sem limite e não afeta as que têm', () => {
    const { tags: nova } = addTagToList(tags, 'Saúde')
    expect(limiteDaTag(nova.find(t => t.label === 'Saúde'))).toBe(0)
    expect(limiteDaTag(nova.find(t => t.id === 'mercado'))).toBe(400)
  })
})

describe('statusLimite', () => {
  it.each([
    [0, 'ok', 0], [319.99, 'ok', 79.9975], [320, 'alerta', 80], [399, 'alerta', 99.75], [400, 'alerta', 100], [400.01, 'estourou', 100.0025],
  ])('gasto %s de 400 -> %s', (gasto, nivel) => {
    expect(statusLimite(gasto, 400).nivel).toBe(nivel)
  })
  it('sem limite devolve null', () => {
    expect(statusLimite(100, 0)).toBeNull()
    expect(statusLimite(100, undefined)).toBeNull()
  })
})

describe('limitesDoMes', () => {
  const stats = (txs) => computeTagStats(expandDespesas(txs, '2026-10-01', '2026-10-31'), tags)
  const saida = (valor, tag, extra = {}) => ({ id: `s${Math.random()}`, tipo: 'saida', frequencia: 'unico', dataInicio: '2026-10-08', valor, descricao: 'x', categoria: 'conforto', tag, ...extra })

  it('só lista tags com limite, mesmo sem gasto, com o gasto do mês e o nível', () => {
    const r = limitesDoMes(tags, stats([saida(350, 'mercado')]))
    expect(r.map(x => x.id)).toEqual(['mercado', 'transporte'])
    expect(r[0]).toMatchObject({ gasto: 350, limite: 400, nivel: 'alerta' })
    expect(r[1]).toMatchObject({ gasto: 0, limite: 100, nivel: 'ok' })
  })

  it('ordena da tag mais perto do limite para a mais folgada', () => {
    const r = limitesDoMes(tags, stats([saida(120, 'transporte'), saida(100, 'mercado')]))
    expect(r.map(x => x.id)).toEqual(['transporte', 'mercado'])
    expect(r[0].nivel).toBe('estourou')
  })

  it('sem nenhuma tag com limite devolve lista vazia', () => {
    expect(limitesDoMes([{ id: 'a', label: 'A', cor: '#fff' }], stats([]))).toEqual([])
    expect(limitesDoMes(undefined, undefined)).toEqual([])
  })

  it('gasto no cartão (item de fatura com tag) conta pela data da compra', () => {
    const fatura = {
      id: 'f', tipo: 'cartao', frequencia: 'unico', cartaoId: 'c1', descricao: 'Fatura', dataInicio: '2026-11-10', valor: 90,
      itens: [{ descricao: 'Uber', valor: 90, categoria: 'conforto', tag: 'transporte', dataCompra: '2026-10-12' }],
    }
    expect(limitesDoMes(tags, stats([fatura])).find(x => x.id === 'transporte')).toMatchObject({ gasto: 90, nivel: 'alerta' })
  })

  it('despesa sem tag e investimento não entram em nenhum limite', () => {
    const r = limitesDoMes(tags, stats([saida(500, undefined), { id: 'i', tipo: 'investimento', frequencia: 'unico', dataInicio: '2026-10-08', valor: 900, descricao: 'a', categoria: 'liberdade' }]))
    expect(r.every(x => x.gasto === 0)).toBe(true)
  })
})
