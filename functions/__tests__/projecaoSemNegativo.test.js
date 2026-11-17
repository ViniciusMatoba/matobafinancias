import { describe, it, expect, beforeEach } from 'vitest'
import {
  bot, fake, fixarRelogio, instalarTelegramFalso, enviarAoBot, mensagemTelegram, ultimaMensagem, criarUsuario, lancamento,
} from './helpers'

/**
 * Telegram: o buraco da conta (a conta vai precisar de dinheiro) é um RESGATE necessário, não um saldo negativo.
 * N7 (resumo semanal, fim do mês) e /projecao não mostram valor com sinal de menos e dizem se o investido cobre.
 * Hoje = 14/10/2026 (quarta-feira).
 */
fixarRelogio()
beforeEach(() => { fake.limpar(); instalarTelegramFalso() })

const nbsp = (t) => String(t).replace(/[  ]/g, ' ')
const tx = (tipo, valor, dataInicio, extra = {}) => ({ tipo, valor, dataInicio, frequencia: 'unico', descricao: tipo, ...extra })
const TODOS = Array.from({ length: 27 }, (_, i) => `n${i + 1}`)
const so7 = { tipos: Object.fromEntries(TODOS.map(n => [n, n === 'n7'])), diaSemanaResumo: 3 }

/** Conta com R$ 500 hoje, R$ 3.000 investidos e uma saída grande no fim do mês. */
const comInvestido = (saida, investido = 3000) => ([
  { id: 'sal', ...tx('entrada', 500 + investido, '2026-10-01') },
  ...(investido ? [{ id: 'ap', ...tx('investimento', investido, '2026-10-02', { metaId: 'g1' }) }] : []),
  { id: 'sai', ...tx('saida', saida, '2026-10-25', { categoria: 'custos_fixos' }) },
])
const resumoSemanal = (txs) => nbsp(bot.checkNotifications([], txs, {}, so7, [], 0).map(m => (typeof m === 'string' ? m : m.text)).join('\n'))

describe('N7 — resumo semanal com o fim do mês abaixo de zero', () => {
  it('investido cobre: diz quanto a conta vai precisar e que o investido cobre; sem sinal de menos', () => {
    const t = resumoSemanal(comInvestido(1438.37)) // fim do mês: 500 − 1.438,37 = −938,37
    expect(t).toContain('a conta vai precisar de *R$ 938,37*')
    expect(t).toContain('O que você tem investido (R$ 3.000,00) cobre esse valor')
    expect(t).not.toMatch(/-R\$|−R\$|R\$ -/)
    expect(t).not.toContain('saldo negativo')
  })

  it('investido insuficiente: diz quanto falta mesmo resgatando tudo', () => {
    const t = resumoSemanal(comInvestido(1438.37, 500)) // conta 500; precisa 938,37; investido 500 → faltam 438,37
    expect(t).toContain('Mesmo resgatando tudo o que está investido (R$ 500,00) faltam R$ 438,37')
    expect(t).not.toMatch(/-R\$|−R\$|R\$ -/)
  })

  it('nada investido: diz que não há valor para cobrir', () => {
    const t = resumoSemanal(comInvestido(1438.37, 0))
    expect(t).toContain('Não há valor investido para cobrir')
  })

  it('saldo positivo no fim do mês continua igual (saldo projetado e gasto por dia)', () => {
    const t = resumoSemanal(comInvestido(100))
    expect(t).toContain('Saldo projetado (31/10): *R$ 400,00*')
    expect(t).toContain('Pode gastar até')
  })
})

describe('/projecao — próximos 7 dias', () => {
  const semear = (investido) => {
    criarUsuario()
    comInvestido(800, investido).forEach(d => { const { id, ...resto } = d; lancamento(id, { ...resto, dataInicio: id === 'sai' ? '2026-10-16' : resto.dataInicio }) })
  }

  it('dia com a conta abaixo de zero vira "precisa de R$ X" e o investido cobre', async () => {
    semear(3000) // conta 500; saída de 800 em 16/10 → precisa de 300
    await enviarAoBot(mensagemTelegram('/projecao'))
    const t = nbsp(ultimaMensagem())
    expect(t).toContain('precisa de R$ 300,00')
    expect(t).toContain('🟡')
    expect(t).toContain('cobre esse valor')
    expect(t).not.toMatch(/-R\$|−R\$|R\$ -/)
  })

  it('sem investido suficiente: ícone vermelho e quanto falta', async () => {
    semear(100)
    await enviarAoBot(mensagemTelegram('/projecao'))
    const t = nbsp(ultimaMensagem())
    expect(t).toContain('🔴')
    expect(t).toContain('faltam R$ 200,00')
  })

  it('sem dia abaixo de zero a mensagem não muda', async () => {
    criarUsuario()
    lancamento('sal', tx('entrada', 2000, '2026-10-01'))
    lancamento('c', tx('saida', 100, '2026-10-16', { categoria: 'custos_fixos' }))
    await enviarAoBot(mensagemTelegram('/projecao'))
    const t = nbsp(ultimaMensagem())
    expect(t).not.toContain('precisa de')
    expect(t).not.toContain('A conta vai precisar')
  })
})

describe('/previsao — próximos 30 dias', () => {
  const semear = (investido) => {
    criarUsuario()
    comInvestido(1438.37, investido).forEach(d => { const { id, ...resto } = d; lancamento(id, resto) }) // conta 500; −938,37 em 25/10
  }

  it('fim do período abaixo de zero: "a conta vai precisar de R$ X" e o investido cobre; sem sinal de menos', async () => {
    semear(3000)
    await enviarAoBot(mensagemTelegram('/previsao'))
    const t = nbsp(ultimaMensagem())
    expect(t).toContain('Em 30 dias a conta vai precisar de *R$ 938,37*')
    expect(t).toContain('cobre esse valor')
    expect(t).not.toMatch(/-R\$|−R\$|R\$ -/)
    expect(t).not.toContain('Saldo em 30 dias')
  })

  it('investido insuficiente: diz quanto falta', async () => {
    semear(500)
    await enviarAoBot(mensagemTelegram('/previsao'))
    expect(nbsp(ultimaMensagem())).toContain('faltam R$ 438,37')
  })

  it('saldo positivo no fim continua igual', async () => {
    criarUsuario()
    lancamento('sal', tx('entrada', 2000, '2026-10-01'))
    await enviarAoBot(mensagemTelegram('/previsao'))
    const t = nbsp(ultimaMensagem())
    expect(t).toContain('Saldo em 30 dias: *R$ 2.000,00*')
    expect(t).not.toContain('vai precisar')
  })
})

describe('N15 — saldo abaixo do mínimo', () => {
  const so15 = { tipos: Object.fromEntries(TODOS.map(n => [n, n === 'n15'])) }
  const roda15 = (txs) => bot.checkNotifications([], txs, {}, so15, [], 0).map(m => ({ ...m, text: nbsp(typeof m === 'string' ? m : m.text) }))

  it('conta abaixo de zero com investido: sem valor negativo, diz o que a conta precisa e que o investido cobre', () => {
    const txs = [
      { id: 'e', ...tx('entrada', 3100, '2026-10-01') },
      { id: 'a', ...tx('investimento', 3000, '2026-10-02') },
      { id: 's', ...tx('saida', 600, '2026-10-05', { categoria: 'custos_fixos' }) },
    ] // conta: 100 − 600 = −500; mínimo padrão 200 → precisa de 700
    const [m] = roda15(txs)
    expect(m.text).toContain('A conta precisa de *R$ 700,00* para voltar ao mínimo de *R$ 200,00*')
    expect(m.text).toContain('O que você tem investido (R$ 3.000,00) cobre esse valor')
    expect(m.text).not.toMatch(/-R\$|−R\$|R\$ -/)
    expect(m.estado.chave).toBe('saldo-baixo')
  })

  it('conta abaixo de zero sem investido: diz que não há valor guardado', () => {
    const [m] = roda15([{ id: 'e', ...tx('entrada', 100, '2026-10-01') }, { id: 's', ...tx('saida', 600, '2026-10-05', { categoria: 'custos_fixos' }) }])
    expect(m.text).toContain('Não há valor investido para cobrir')
    expect(m.text).not.toMatch(/-R\$|−R\$|R\$ -/)
  })

  it('saldo baixo mas positivo mantém a mensagem e acrescenta quanto há investido', () => {
    const [m] = roda15([{ id: 'e', ...tx('entrada', 3150, '2026-10-01') }, { id: 'a', ...tx('investimento', 3000, '2026-10-02') }]) // conta 150
    expect(m.text).toContain('Seu saldo atual é *R$ 150,00* — abaixo do mínimo de *R$ 200,00*')
    expect(m.text).toContain('Você tem R$ 3.000,00 investidos')
  })

  it('saldo acima do mínimo não avisa', () => {
    expect(roda15([{ id: 'e', ...tx('entrada', 1000, '2026-10-01') }])).toHaveLength(0)
  })
})
