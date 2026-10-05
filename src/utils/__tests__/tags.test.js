import { describe, it, expect } from 'vitest'
import { addTagToList, countTagUsage, normalizeText, tagIdSet, tagsById } from '../tags'

describe('normalizeText', () => {
  it('ignora acento, caixa e espaços extras', () => {
    expect(normalizeText('  Alimentação  ')).toBe('alimentacao')
    expect(normalizeText('MERCADO   extra')).toBe('mercado extra')
  })
})

describe('addTagToList', () => {
  it('cria a primeira tag com id e cor', () => {
    const { tags, tag } = addTagToList([], 'Mercado')
    expect(tags).toHaveLength(1)
    expect(tag).toMatchObject({ id: 'mercado', label: 'Mercado' })
    expect(tag.cor).toMatch(/^#/)
  })

  it('não duplica o nome, ignorando acento e caixa, e mantém a mesma lista', () => {
    const first = addTagToList([], 'Saúde').tags
    const { tags, tag } = addTagToList(first, 'saude')
    expect(tags).toBe(first)
    expect(tag.label).toBe('Saúde')
  })

  it('gera id único e cor diferente para nomes que colidem no slug', () => {
    const a = addTagToList([], 'Pet').tags
    const withB = addTagToList([{ ...a[0], label: 'Outro nome' }], 'Pet!')
    expect(withB.tags).toHaveLength(2)
    expect(new Set(withB.tags.map(t => t.id)).size).toBe(2)
    expect(withB.tags[0].cor).not.toBe(withB.tags[1].cor)
  })

  it('ignora nome vazio e limita o tamanho', () => {
    expect(addTagToList([], '   ').tag).toBeNull()
    expect(addTagToList([], 'x'.repeat(60)).tag.label).toHaveLength(24)
  })
})

describe('tagIdSet / tagsById', () => {
  const tags = [{ id: 'a', label: 'A', cor: '#111' }, { id: 'b', label: 'B', cor: '#222' }]
  it('indexa por id', () => {
    expect(tagIdSet(tags).has('a')).toBe(true)
    expect(tagsById(tags).b.label).toBe('B')
  })
  it('aceita lista ausente', () => {
    expect(tagIdSet(undefined).size).toBe(0)
    expect(tagsById(null)).toEqual({})
  })
})

describe('countTagUsage', () => {
  it('conta lançamentos e itens de fatura', () => {
    const txs = [
      { id: '1', tag: 'mercado' },
      { id: '2', tag: 'mercado' },
      { id: '3', itens: [{ tag: 'streaming' }, { tag: 'mercado' }, {}] },
      { id: '4' },
    ]
    expect(countTagUsage(txs)).toEqual({ mercado: 3, streaming: 1 })
  })
})
