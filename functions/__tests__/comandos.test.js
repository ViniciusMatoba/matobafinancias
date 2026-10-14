import { describe, it, expect, beforeEach } from 'vitest'
import {
  bot, fake, UID, CHAT, HOJE, fixarRelogio, instalarTelegramFalso, enviarAoBot, mensagemTelegram,
  botaoTelegram, ultimaMensagem, mensagensEnviadas, chamadasTelegram, criarUsuario, lancamento, lancamentos,
} from './helpers'

/**
 * Comandos do Telegram de ponta a ponta: update do Telegram -> telegramWebhook -> processUpdate -> handler
 * -> Firestore (em memória) -> mensagem que sairia para o Telegram.
 */
fixarRelogio()

beforeEach(() => {
  fake.limpar()
  instalarTelegramFalso()
})

const entrada = (valor, dataInicio = '2026-10-01') =>
  ({ tipo: 'entrada', frequencia: 'unico', dataInicio, valor, descricao: 'Salário' })
const gasto = (valor, descricao, categoria, extra = {}) =>
  ({ tipo: 'saida', frequencia: 'unico', dataInicio: '2026-10-08', valor, descricao, categoria, ...extra })

describe('vínculo e roteamento', () => {
  it('usuário não vinculado recebe as instruções de vínculo', async () => {
    await enviarAoBot(mensagemTelegram('/saldo', 999))
    expect(ultimaMensagem()).toContain('vincule sua conta')
  })

  it('/vincular com código válido liga o chat ao usuário e consome o código', async () => {
    fake.seed('telegramLinks/ABC123', { uid: UID, email: 'a@b.c', expiresAt: { toDate: () => new Date('2026-10-14T16:00:00Z') } })
    fake.seed(`users/${UID}`, {})
    await enviarAoBot(mensagemTelegram('/vincular abc123', 555))
    expect(fake.ler(`users/${UID}`).telegramChatId).toBe('555')
    expect(fake.existe('telegramLinks/ABC123')).toBe(false)
  })

  it('/vincular com código expirado não vincula', async () => {
    fake.seed('telegramLinks/OLD111', { uid: UID, email: 'a@b.c', expiresAt: { toDate: () => new Date('2026-10-14T10:00:00Z') } })
    fake.seed(`users/${UID}`, {})
    await enviarAoBot(mensagemTelegram('/vincular OLD111', 555))
    expect(ultimaMensagem()).toContain('expirado')
    expect(fake.ler(`users/${UID}`).telegramChatId).toBeUndefined()
  })

  it('/vincular com código inexistente avisa', async () => {
    await enviarAoBot(mensagemTelegram('/vincular ZZZ999', 555))
    expect(ultimaMensagem()).toContain('inválido')
  })

  it('comando desconhecido e comandos de edição são tratados', async () => {
    criarUsuario()
    await enviarAoBot(mensagemTelegram('/xyz'))
    expect(ultimaMensagem()).toContain('Comando não reconhecido')
    await enviarAoBot(mensagemTelegram('/adicionar 50 mercado'))
    expect(ultimaMensagem().toLowerCase()).toContain('aplicativo')
  })

  it('botões de teclado em texto livre são mapeados ("💰 Saldo")', async () => {
    criarUsuario()
    lancamento('a', entrada(300))
    await enviarAoBot(mensagemTelegram('💰 Saldo'))
    expect(ultimaMensagem()).toContain('Saldo Global')
  })
})

describe('/saldo', () => {
  it('soma carteiras iniciais e lançamentos até hoje, sem os futuros', async () => {
    criarUsuario()
    fake.seed('wallets/w1', { userId: UID, nome: 'Conta', saldoInicial: 500 })
    lancamento('a', entrada(1000))
    lancamento('b', gasto(300, 'Mercado', 'custos_fixos'))
    lancamento('c', gasto(9999, 'Futuro', 'conforto', { dataInicio: '2026-10-30' }))
    await enviarAoBot(mensagemTelegram('/saldo'))
    expect(ultimaMensagem()).toContain('Saldo Global:* R$ 1.200,00')
  })

  it('saldo negativo vem com aviso', async () => {
    criarUsuario()
    lancamento('b', gasto(300, 'Mercado', 'custos_fixos'))
    await enviarAoBot(mensagemTelegram('/saldo'))
    expect(ultimaMensagem()).toContain('⚠️')
  })

  it('não mistura dados de outro usuário', async () => {
    criarUsuario()
    fake.seed('transactions/outro/entries/x', entrada(50000))
    fake.seed('wallets/wo', { userId: 'outro', nome: 'Dele', saldoInicial: 70000 })
    lancamento('a', entrada(100))
    await enviarAoBot(mensagemTelegram('/saldo'))
    expect(ultimaMensagem()).toContain('R$ 100,00')
    expect(ultimaMensagem()).not.toContain('Dele')
  })
})

describe('/gastos, /meses e /tags (competência)', () => {
  it('/gastos lista as despesas do mês e ignora entradas', async () => {
    criarUsuario()
    lancamento('a', entrada(5000))
    lancamento('b', gasto(120, 'Padaria', 'custos_fixos'))
    lancamento('c', gasto(80, 'Cinema', 'prazeres'))
    await enviarAoBot(mensagemTelegram('/gastos'))
    const t = mensagensEnviadas().join('\n')
    expect(t).toContain('Padaria')
    expect(t).toContain('Cinema')
    expect(t).not.toContain('Salário')
  })

  it('/gastos filtrado por termo traz só o que casa', async () => {
    criarUsuario()
    lancamento('b', gasto(120, 'Padaria Central', 'custos_fixos'))
    lancamento('c', gasto(80, 'Cinema', 'prazeres'))
    await enviarAoBot(mensagemTelegram('/gastos padaria'))
    const t = mensagensEnviadas().join('\n')
    expect(t).toContain('Padaria')
    expect(t).not.toContain('Cinema')
  })

  it('/gastos top ordena do maior para o menor', async () => {
    criarUsuario()
    lancamento('b', gasto(50, 'Pequeno', 'conforto'))
    lancamento('c', gasto(900, 'Grande', 'conforto'))
    await enviarAoBot(mensagemTelegram('/gastos top'))
    const t = mensagensEnviadas().join('\n')
    expect(t.indexOf('Grande')).toBeLessThan(t.indexOf('Pequeno'))
  })

  it('/gastos sem despesas avisa que não há nada', async () => {
    criarUsuario()
    await enviarAoBot(mensagemTelegram('/gastos'))
    expect(ultimaMensagem()).toContain('Nenhuma despesa')
  })

  it('/tags agrupa por tag do usuário', async () => {
    criarUsuario({ config: { tags: [{ id: 'mercado', label: 'Mercado', cor: '#fff' }] } })
    lancamento('b', gasto(120, 'Compra grande', 'custos_fixos', { tag: 'mercado' }))
    lancamento('c', gasto(80, 'Sem tag', 'prazeres'))
    await enviarAoBot(mensagemTelegram('/tags'))
    const t = mensagensEnviadas().join('\n')
    expect(t).toContain('Mercado')
    expect(t).toContain('R$ 120,00')
  })

  it('/meses responde com o total por mês', async () => {
    criarUsuario()
    lancamento('b', gasto(120, 'Padaria', 'custos_fixos'))
    await enviarAoBot(mensagemTelegram('/meses'))
    expect(ultimaMensagem()).toContain('R$ 120,00')
  })
})

describe('/investimentos', () => {
  const comPerfil = { investimentos: { perfil: 'clt', mesesMeta: 6, despesasMens: 3000 } }

  it('com sobra acima de R$ 200 informa o valor para aportar', async () => {
    criarUsuario({ config: comPerfil })
    lancamento('a', entrada(5000))
    await enviarAoBot(mensagemTelegram('/investimentos'))
    expect(ultimaMensagem()).toContain('R$ 5.000,00')
  })

  it('com sobra abaixo de R$ 200 não oferece valor e avisa o motivo', async () => {
    criarUsuario({ config: comPerfil })
    lancamento('a', entrada(150))
    await enviarAoBot(mensagemTelegram('/investimentos'))
    expect(ultimaMensagem()).toContain('200')
    expect(ultimaMensagem()).not.toContain('R$ 150,00 para aportar')
  })
})

describe('/projecao e /ajuda', () => {
  it('/projecao responde sem erro com dados simples', async () => {
    criarUsuario()
    lancamento('a', entrada(2000))
    lancamento('b', gasto(500, 'Aluguel', 'custos_fixos', { dataInicio: '2026-10-20' }))
    await enviarAoBot(mensagemTelegram('/projecao'))
    expect(chamadasTelegram.some(c => c.metodo === 'sendMessage')).toBe(true)
  })
  it('/ajuda lista comandos', async () => {
    criarUsuario()
    await enviarAoBot(mensagemTelegram('/ajuda'))
    expect(ultimaMensagem()).toContain('/saldo')
  })
})

// ─── Botões Pago / Adiar ────────────────────────────────────────────────────
const f1 = (extra = {}) => ({
  tipo: 'cartao', frequencia: 'unico', cartaoId: 'c1', descricao: 'Nubank', dataInicio: '2026-10-10', valor: 300,
  itens: [
    { descricao: 'Mercado', valor: 100, categoria: 'custos_fixos', dataCompra: '2026-09-28' },
    { descricao: 'TV', valor: 200, categoria: 'conforto', dataCompra: '2026-09-20', isParcelado: true, parcelaAtual: 1, totalParcelas: 3 },
  ],
  ...extra,
})
/** Saldo de caixa mês a mês, usando o mesmo motor do bot. */
const caixaAte = (data) => bot.calcSaldoSimples(lancamentos(), data, 0)

describe('botão Pago', () => {
  it('lançamento único: vira conferido e vai para hoje', async () => {
    criarUsuario()
    lancamento('a', gasto(200, 'Luz', 'custos_fixos', { dataInicio: '2026-10-20' }))
    await enviarAoBot(botaoTelegram('pay:a:2026-10-20'))
    expect(fake.ler(`transactions/${UID}/entries/a`)).toMatchObject({ conferido: true, dataInicio: HOJE })
  })

  it('recorrente: exclui a ocorrência e cria um lançamento real conferido', async () => {
    criarUsuario()
    lancamento('r', gasto(100, 'Internet', 'custos_fixos', { frequencia: 'mensal', dataInicio: '2026-06-18' }))
    await enviarAoBot(botaoTelegram('pay:r:2026-10-18'))
    expect(fake.ler(`transactions/${UID}/entries/r`).exclusoes).toEqual(['2026-10-18'])
    const novo = lancamentos().find(l => l.id !== 'r')
    expect(novo).toMatchObject({ frequencia: 'unico', conferido: true, valor: 100, dataInicio: HOJE })
  })

  it('fatura projetada: o pagamento não projeta as parcelas de novo (sem duplicar no caixa)', async () => {
    criarUsuario()
    lancamento('f', f1())
    const antes = caixaAte('2027-03-31') // 300 + 200 + 200
    expect(antes).toBe(-700)
    const proj = bot.expandRange([{ id: 'f', ...f1() }], '2026-11-10', '2026-11-10')[0]
    expect(proj.tx.id).toContain('-proj-')
    await enviarAoBot(botaoTelegram(`pay:${proj.tx.id}:2026-11-10`))

    const pai = fake.ler(`transactions/${UID}/entries/f`)
    expect(pai.exclusoes).toContain('2026-11-10')
    const pago = lancamentos().find(l => l.id !== 'f')
    expect(pago.conferido).toBe(true)
    expect(pago.valor).toBe(200) // só a parcela do mês, não a fatura inteira
    expect(pago.itens.every(i => i.isParcelado === false)).toBe(true)
    // o total do caixa não pode ter crescido: a parcela 2/3 saiu da projeção e entrou como pagamento
    expect(caixaAte('2027-03-31')).toBe(antes)
  })

  it('lançamento inexistente não quebra o bot', async () => {
    criarUsuario()
    const res = await enviarAoBot(botaoTelegram('pay:naoexiste:2026-10-20'))
    expect(res.codigo).toBe(200)
  })

  it('botão de chat não vinculado é ignorado', async () => {
    criarUsuario()
    lancamento('a', gasto(200, 'Luz', 'custos_fixos', { dataInicio: '2026-10-20' }))
    await enviarAoBot(botaoTelegram('pay:a:2026-10-20', 999))
    expect(fake.ler(`transactions/${UID}/entries/a`).conferido).toBeUndefined()
  })
})

describe('botão Adiar', () => {
  it('lançamento único: move 5 dias', async () => {
    criarUsuario()
    lancamento('a', gasto(200, 'Luz', 'custos_fixos', { dataInicio: '2026-10-20' }))
    await enviarAoBot(botaoTelegram('postpone:a:2026-10-20:5'))
    expect(fake.ler(`transactions/${UID}/entries/a`).dataInicio).toBe('2026-10-25')
  })

  it('recorrente: exclui a ocorrência e cria um único adiado, não conferido', async () => {
    criarUsuario()
    lancamento('r', gasto(100, 'Internet', 'custos_fixos', { frequencia: 'mensal', dataInicio: '2026-06-18' }))
    await enviarAoBot(botaoTelegram('postpone:r:2026-10-18:5'))
    expect(fake.ler(`transactions/${UID}/entries/r`).exclusoes).toEqual(['2026-10-18'])
    const novo = lancamentos().find(l => l.id !== 'r')
    expect(novo).toMatchObject({ dataInicio: '2026-10-23', conferido: false, frequencia: 'unico' })
  })

  it('fatura projetada adiada também não duplica o caixa', async () => {
    criarUsuario()
    lancamento('f', f1())
    const antes = caixaAte('2027-03-31')
    expect(antes).toBe(-700)
    const proj = bot.expandRange([{ id: 'f', ...f1() }], '2026-11-10', '2026-11-10')[0]
    await enviarAoBot(botaoTelegram(`postpone:${proj.tx.id}:2026-11-10:5`))
    expect(caixaAte('2027-03-31')).toBe(antes)
  })
})
