import { describe, it, expect } from 'vitest'
import {
  addTagToList, countTagUsage, normalizeText, tagIdSet, tagsById,
  isSimilarDesc, countUntagged, buildUntaggedGroups, buildTaggedIndex, suggestTag, buildTagUpdates,
  computeTagStats, SEM_TAG,
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

// ── Painel: despesas por tag ─────────────────────────────────────────────────
describe('computeTagStats', () => {
  const occ = (tx, valor = tx.valor) => ({ tx, valor })
  const occs = [
    occ({ tipo: 'saida', descricao: 'Mercado Extra', tag: 'mercado', categoria: 'custos_fixos', valor: 300 }),
    occ({ tipo: 'saida', descricao: 'Padaria', categoria: 'custos_fixos', valor: 40 }),
    occ({ tipo: 'saida', descricao: 'Netflix', tag: 'streaming', categoria: 'conforto', valor: 55.9 }),
    occ({ tipo: 'saida', descricao: 'Loja', tag: 'apagada', categoria: 'prazeres', valor: 10 }),
    occ({ tipo: 'investimento', descricao: 'CDB', valor: 500 }),
    occ({ tipo: 'entrada', descricao: 'Salário', valor: 5000 }),
    occ({
      tipo: 'cartao', valor: 150,
      itens: [
        { descricao: 'Supermercado', valor: 100, categoria: 'custos_fixos', tag: 'mercado' },
        { descricao: 'Uber', valor: 50, categoria: 'conforto' },
      ],
    }),
  ]
  const stats = computeTagStats(occs, TAGS)

  it('soma só despesas (sem investimento nem entrada) e conta cada item de fatura', () => {
    expect(stats.total).toBeCloseTo(555.9, 2)
    const mercado = stats.list.find(t => t.id === 'mercado')
    expect(mercado).toMatchObject({ value: 400, count: 2 })
  })

  it('agrupa o que não tem tag, ou tem tag apagada, em "Sem tag", sempre por último', () => {
    const sem = stats.list.find(t => t.id === SEM_TAG)
    expect(sem).toMatchObject({ label: 'Sem tag', value: 100, count: 3 }) // 40 + 10 + 50
    expect(stats.list.at(-1).id).toBe(SEM_TAG)
    expect(stats.list.map(t => t.id)).toEqual(['mercado', 'streaming', SEM_TAG])
  })

  it('calcula a porcentagem e a divisão por categoria dentro de cada tag', () => {
    const mercado = stats.list.find(t => t.id === 'mercado')
    expect(mercado.pct).toBe(72) // 400 / 555,9
    expect(mercado.catList).toEqual([{ cat: 'custos_fixos', value: 400 }])
    expect(stats.list.reduce((s, t) => s + t.value, 0)).toBeCloseTo(stats.total, 2)
  })

  it('expõe as tags reais de cada categoria (sem "Sem tag")', () => {
    expect(stats.catTags.custos_fixos).toEqual({ mercado: 400 })
    expect(stats.catTags.conforto).toEqual({ streaming: 55.9 })
    expect(stats.catTags.prazeres).toBeUndefined()
  })

  it('lida com período vazio e sem tags criadas', () => {
    expect(computeTagStats([], TAGS)).toEqual({ total: 0, list: [], catTags: {} })
    const semTags = computeTagStats(occs, [])
    expect(semTags.list).toHaveLength(1)
    expect(semTags.list[0]).toMatchObject({ id: SEM_TAG, value: 555.9 })
  })
})
