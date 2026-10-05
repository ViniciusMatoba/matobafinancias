import { describe, it, expect } from 'vitest'
import {
  addTagToList, countTagUsage, normalizeText, tagIdSet, tagsById,
  isSimilarDesc, countUntagged, buildUntaggedGroups, buildTaggedIndex, suggestTag, buildTagUpdates,
} from '../tags'

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

// ── Classificação em lote ────────────────────────────────────────────────────
const TAGS = [
  { id: 'mercado', label: 'Mercado', cor: '#111' },
  { id: 'streaming', label: 'Streaming', cor: '#222' },
]
const TODAY = '2026-10-05'
const saida = (id, descricao, valor, extra = {}) => ({
  id, tipo: 'saida', frequencia: 'unico', descricao, valor, dataInicio: '2026-08-10', ...extra,
})

describe('isSimilarDesc', () => {
  it('reconhece iguais, contidas e com palavras em comum', () => {
    expect(isSimilarDesc('Mercado Extra', 'mercado  extra')).toBe(true)
    expect(isSimilarDesc('Extra', 'Mercado Extra')).toBe(true)
    expect(isSimilarDesc('Netflix', 'Aluguel')).toBe(false)
  })
})

describe('countUntagged', () => {
  const txs = [
    saida('1', 'Netflix', 10, { tag: 'streaming' }),
    saida('2', 'Padaria', 5),
    saida('3', 'Loja', 5, { tag: 'apagada' }),
    saida('4', 'Ajuste de saldo – teste', 99),
    { id: '5', tipo: 'entrada', frequencia: 'unico', descricao: 'Salário', valor: 1000, dataInicio: '2026-08-01' },
    { id: '6', tipo: 'cartao', frequencia: 'unico', dataInicio: '2026-09-10', valor: 30,
      itens: [{ descricao: 'Uber', valor: 10, tag: 'mercado' }, { descricao: 'Uber', valor: 20 }] },
  ]
  it('conta só o que aceita tag; tag apagada e ajuste de saldo seguem a regra', () => {
    // classificáveis: 1, 2, 3 e os 2 itens do cartão (entrada e ajuste ficam de fora)
    expect(countUntagged(txs, TAGS)).toEqual({ total: 5, untagged: 3 })
  })
})

describe('buildUntaggedGroups', () => {
  it('agrupa ignorando acento/caixa, soma o valor e ordena pelo que mais pesou', () => {
    const txs = [
      saida('1', 'Padaria Pão', 10), saida('2', 'padaria pao', 15), saida('3', 'Farmácia', 100),
      saida('4', 'Netflix', 50, { tag: 'streaming' }),
    ]
    const groups = buildUntaggedGroups(txs, TAGS, TODAY)
    expect(groups.map(g => g.key)).toEqual(['farmacia', 'padaria pao'])
    expect(groups[1]).toMatchObject({ count: 2, total: 25, recorrente: false })
  })

  it('conta as ocorrências de um lançamento recorrente até hoje', () => {
    const txs = [{ id: 'r', tipo: 'saida', frequencia: 'mensal', descricao: 'Academia', valor: 100, dataInicio: '2026-06-05' }]
    const [g] = buildUntaggedGroups(txs, TAGS, TODAY)
    expect(g).toMatchObject({ recorrente: true, count: 1, total: 500 }) // jun, jul, ago, set, out
  })

  it('junta lançamento comum e item de fatura de mesma descrição', () => {
    const txs = [
      saida('1', 'Uber', 30),
      { id: '2', tipo: 'cartao', frequencia: 'unico', dataInicio: '2026-09-10', valor: 20, itens: [{ descricao: 'UBER', valor: 20 }] },
    ]
    const [g] = buildUntaggedGroups(txs, TAGS, TODAY)
    expect(g).toMatchObject({ key: 'uber', count: 2, total: 50 })
  })
})

describe('suggestTag', () => {
  const index = buildTaggedIndex([saida('1', 'Mercado Extra', 10, { tag: 'mercado' })], TAGS)
  it('sugere pela mesma descrição ou por uma parecida', () => {
    expect(suggestTag({ key: 'mercado extra' }, index)).toMatchObject({ tag: 'mercado', exata: true })
    expect(suggestTag({ key: 'extra supermercado mercado' }, index)).toMatchObject({ tag: 'mercado', exata: false })
  })
  it('não sugere quando nada se parece', () => {
    expect(suggestTag({ key: 'aluguel' }, index)).toBeNull()
  })
})

describe('buildTagUpdates', () => {
  const card = {
    id: 'c', tipo: 'cartao', frequencia: 'unico', dataInicio: '2026-09-10', valor: 60,
    itens: [
      { descricao: 'Uber', valor: 10, categoria: 'conforto' },
      { descricao: 'Uber', valor: 20, tag: 'mercado' },
      { descricao: 'Pizza', valor: 30 },
    ],
  }
  const txs = [saida('1', 'Uber', 5), saida('2', 'Uber', 7, { tag: 'streaming' }), saida('3', 'Uber', 9, { tag: 'apagada' }), card]

  it('aplica só onde falta tag (inclui tag apagada) e preserva os demais campos do item', () => {
    const { updates } = buildTagUpdates(txs, 'uber', 'mercado', TAGS)
    expect(updates.map(u => u.id).sort()).toEqual(['1', '3', 'c'])
    const cardUpdate = updates.find(u => u.id === 'c').data.itens
    expect(cardUpdate[0]).toEqual({ descricao: 'Uber', valor: 10, categoria: 'conforto', tag: 'mercado' })
    expect(cardUpdate[1].tag).toBe('mercado')
    expect(cardUpdate[2]).toEqual({ descricao: 'Pizza', valor: 30 })
  })

  it('só grava tag e itens, e o desfazer devolve o estado anterior', () => {
    const { updates, undo } = buildTagUpdates(txs, 'uber', 'mercado', TAGS)
    for (const u of updates) expect(Object.keys(u.data)).toHaveLength(1)
    expect(undo.find(u => u.id === '1').data).toEqual({ tag: null })
    expect(undo.find(u => u.id === '3').data).toEqual({ tag: 'apagada' })
    expect(undo.find(u => u.id === 'c').data.itens).toBe(card.itens)
  })

  it('não mexe em nada quando o grupo não existe', () => {
    expect(buildTagUpdates(txs, 'inexistente', 'mercado', TAGS).updates).toEqual([])
  })
})
