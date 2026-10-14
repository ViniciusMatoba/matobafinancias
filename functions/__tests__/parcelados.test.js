import { describe, it, expect, beforeEach } from 'vitest'
import {
  bot, fake, UID, HOJE, fixarRelogio, instalarTelegramFalso, enviarAoBot, mensagemTelegram, botaoTelegram,
  ultimaMensagem, criarUsuario, lancamento, lancamentos,
} from './helpers'

/**
 * /parcelados: compras parceladas ainda a pagar, calculadas pelas ocorrências (caixa/Projeção) e não pelo
 * parcelaAtual gravado. Hoje = 14/10/2026.
 */
fixarRelogio()

beforeEach(() => {
  fake.limpar()
  instalarTelegramFalso()
  criarUsuario()
  fake.seed(`cards/${UID}/list/c1`, { nome: 'Nubank', diaVencimento: 10, diaFechamento: 3, limite: 5000 })
})

const tv = (k, extra = {}) => ({
  descricao: 'TV', valor: 200, categoria: 'conforto', dataCompra: '2026-07-20',
  isParcelado: true, parcelaAtual: k, totalParcelas: 6, ...extra,
})
const fatura = (id, dataInicio, itens, extra = {}) => lancamento(id, {
  tipo: 'cartao', frequencia: 'unico', cartaoId: 'c1', descricao: 'Fatura', dataInicio,
  valor: itens.reduce((s, i) => s + i.valor, 0), itens, ...extra,
})
const avulso = (extra = {}) => lancamento('a', {
  tipo: 'saida', frequencia: 'parcelado', descricao: 'Sofá', valor: 300, dataInicio: '2026-07-10',
  parcelaAtual: 1, totalParcelas: 12, ...extra,
})
const calc = () => bot.calcParceladosBot(lancamentos(), HOJE)
const pergunta = async () => { await enviarAoBot(mensagemTelegram('/parcelados')); return ultimaMensagem() }

describe('cartão', () => {
  it('A) fatura de setembro (2/6) não paga: setembro vencida + 4 projetadas = 5 restantes', async () => {
    fatura('f', '2026-09-10', [tv(2)])
    const [item] = calc().cartaoItems
    expect(item).toMatchObject({ descricao: 'TV', parcelaAtual: 2, totalParcelas: 6, restam: 5, totalRestante: 1000 })
    const t = await pergunta()
    expect(t).toContain('TV')
    expect(t).toContain('(2/6x)')
    expect(t).toContain('R$ 200,00/mês × 5 restantes = *R$ 1.000,00*')
    expect(t).toContain('Total ainda a pagar: R$ 1.000,00')
  })

  it('B) fatura de outubro (4/6) PAGA: as parcelas 5/6 e 6/6 continuam aparecendo', async () => {
    fatura('f', '2026-10-10', [tv(4)], { conferido: true })
    const [item] = calc().cartaoItems
    expect(item).toMatchObject({ parcelaAtual: 5, restam: 2, totalRestante: 400 })
    expect(await pergunta()).toContain('(5/6x)')
  })

  it('a última parcela é sinalizada', async () => {
    fatura('f', '2026-10-10', [tv(5)], { conferido: true })
    const t = await pergunta()
    expect(t).toContain('(6/6x)')
    expect(t).toContain('última')
  })

  it('compra quitada (todas as parcelas já passaram e foram pagas) não aparece', async () => {
    fatura('f', '2026-10-10', [tv(6)], { conferido: true })
    expect(calc().cartaoItems).toHaveLength(0)
    expect(await pergunta()).toContain('Nenhuma compra parcelada em aberto')
  })

  it('C) pagar a fatura projetada de novembro pelo botão não duplica nem perde parcelas', async () => {
    fatura('f', '2026-10-10', [tv(4)], { conferido: true })
    const antes = calc().cartaoItems[0]
    expect(antes).toMatchObject({ parcelaAtual: 5, restam: 2 })
    const proj = bot.expandRange([{ id: 'f', ...fake.ler(`transactions/${UID}/entries/f`) }], '2026-11-10', '2026-11-10')[0]
    await enviarAoBot(botaoTelegram(`pay:${proj.tx.id}:2026-11-10`))
    // 5/6 virou pagamento real conferido; sobra só a 6/6 (a conferida não conta mais como a pagar)
    const depois = calc().cartaoItems[0]
    expect(depois).toMatchObject({ parcelaAtual: 6, restam: 1, totalRestante: 200 })
  })

  it('fatura real do mês seguinte lançada à mão (itens sem isParcelado) é reconhecida e não duplica', () => {
    fatura('f', '2026-10-10', [tv(4)])
    fatura('g', '2026-11-10', [tv(5, { isParcelado: false })], { exclusoes: [] })
    // o pai projeta 5/6 em novembro e o lançamento real também: conta uma vez só (real vence projetada)
    const [item] = calc().cartaoItems
    expect(item.restam).toBe(3) // 4 (vencida, não paga), 5, 6
    expect(item.totalRestante).toBe(600)
  })

  it('compras diferentes não se misturam e ficam ordenadas pelo maior valor restante', async () => {
    fatura('f', '2026-10-10', [
      tv(4), { descricao: 'Notebook', valor: 500, categoria: 'conforto', dataCompra: '2026-08-01', isParcelado: true, parcelaAtual: 3, totalParcelas: 10 },
    ], { conferido: true })
    const itens = calc().cartaoItems
    expect(itens.map(i => i.descricao)).toContain('Notebook')
    const t = await pergunta()
    expect(t.indexOf('Notebook')).toBeLessThan(t.indexOf('TV'))
  })

  it('item à vista na fatura não entra como parcelado', () => {
    fatura('f', '2026-10-10', [{ descricao: 'Mercado', valor: 100, categoria: 'custos_fixos', dataCompra: '2026-10-01' }])
    expect(calc().cartaoItems).toHaveLength(0)
  })
})

describe('avulsos (frequencia parcelado)', () => {
  it('D) 12x desde julho: só contam as parcelas de hoje em diante (8 de 12)', async () => {
    avulso()
    const [item] = calc().avulsos
    expect(item).toMatchObject({ descricao: 'Sofá', parcelaAtual: 5, restam: 8, totalRestante: 2400 })
    const t = await pergunta()
    expect(t).toContain('(5/12x)')
    expect(t).toContain('R$ 300,00/mês × 8 restantes = *R$ 2.400,00*')
  })

  it('parcela que vence hoje ainda conta como a pagar', () => {
    avulso({ dataInicio: '2026-07-14' })
    expect(calc().avulsos[0].restam).toBe(9) // 14/10 .. 14/06
  })

  it('já totalmente paga/conferida não aparece', () => {
    avulso({ conferido: true })
    expect(calc().avulsos).toHaveLength(0)
  })

  it('terminou antes de hoje não aparece', () => {
    avulso({ dataInicio: '2025-01-10', totalParcelas: 6 })
    expect(calc().avulsos).toHaveLength(0)
  })
})

describe('consistência com o caixa e segurança', () => {
  it('o total mostrado bate com o que ainda vai sair do caixa (avulso)', () => {
    avulso()
    const aSair = bot.calcSaldoSimples(lancamentos(), '2030-12-31', 0) - bot.calcSaldoSimples(lancamentos(), HOJE, 0)
    expect(-aSair).toBe(calc().avulsos[0].totalRestante)
  })

  it('o total mostrado bate com o que ainda vai sair do caixa (fatura paga)', () => {
    fatura('f', '2026-10-10', [tv(4)], { conferido: true })
    const aSair = bot.calcSaldoSimples(lancamentos(), '2030-12-31', 0) - bot.calcSaldoSimples(lancamentos(), HOJE, 0)
    expect(-aSair).toBe(calc().cartaoItems[0].totalRestante)
  })

  it('não mistura parcelas de outro usuário', async () => {
    fake.seed('transactions/outro/entries/x', {
      tipo: 'saida', frequencia: 'parcelado', descricao: 'Do outro', valor: 999, dataInicio: '2026-09-10', parcelaAtual: 1, totalParcelas: 5,
    })
    expect(await pergunta()).toContain('Nenhuma compra parcelada em aberto')
  })

  it('não grava nada no banco (somente leitura)', async () => {
    fatura('f', '2026-10-10', [tv(4)], { conferido: true })
    const antes = JSON.stringify(lancamentos())
    await pergunta()
    expect(JSON.stringify(lancamentos())).toBe(antes)
  })

  it('exclusão de uma ocorrência projetada tira a parcela da lista', () => {
    fatura('f', '2026-10-10', [tv(4)], { conferido: true, exclusoes: ['2026-11-10'] })
    expect(calc().cartaoItems[0]).toMatchObject({ parcelaAtual: 6, restam: 1 })
  })
})
