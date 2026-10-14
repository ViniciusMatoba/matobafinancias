import { describe, it, expect, beforeEach } from 'vitest'
import {
  fake, UID, fixarRelogio, instalarTelegramFalso, enviarAoBot, mensagemTelegram, chamadasTelegram,
  mensagensEnviadas, ultimaMensagem,
} from './helpers'

/**
 * Onboarding pelo Telegram: depois de /vincular o bot faz 6 perguntas (horário, cartão, orçamento, saldo
 * negativo, resumo semanal, resumo diário) e grava as respostas em config/{uid}.notificacoes.
 * Tudo passa pelo telegramWebhook, como no uso real.
 */
fixarRelogio('2026-10-14T15:00:00Z')

beforeEach(() => {
  fake.limpar()
  instalarTelegramFalso()
})

const diz = (texto, chat) => enviarAoBot(mensagemTelegram(texto, chat))
const estado = () => fake.ler(`users/${UID}`)?.telegramOnboarding
const notificacoes = () => fake.ler(`config/${UID}`)?.notificacoes
const teclado = () => chamadasTelegram.filter(c => c.metodo === 'sendMessage').at(-1)?.reply_markup
const botoes = () => (teclado()?.keyboard || []).flat().map(b => b.text)

async function vincular() {
  fake.seed('telegramLinks/ABC123', {
    uid: UID, email: 'vini@exemplo.com', expiresAt: { toDate: () => new Date('2026-10-14T16:00:00Z') },
  })
  fake.seed(`users/${UID}`, {})
  fake.seed(`config/${UID}`, {})
  await diz('/vincular ABC123')
}

describe('início', () => {
  it('/vincular liga a conta, dá as boas-vindas e já faz a pergunta 1', async () => {
    await vincular()
    const todas = mensagensEnviadas()
    expect(todas[0]).toContain('Conta vinculada com sucesso')
    expect(todas[0]).toContain('Vinicius')
    expect(todas[0]).toContain('vini@exemplo.com')
    expect(todas[0]).toContain('6 perguntas')
    expect(todas[1]).toContain('Etapa 1 de 6')
    expect(botoes()).toEqual(['🌅 7h — Manhã', '☀️ 12h — Tarde', '🌙 19h — Noite'])
    expect(fake.ler(`users/${UID}`).telegramChatId).toBe('4242')
    expect(estado()).toMatchObject({ active: true, stepId: 'horario', data: {} })
  })

  it('/vincular de novo no meio do caminho recomeça da etapa 1', async () => {
    await vincular()
    await diz('manhã')
    expect(estado().stepId).toBe('cartoes')
    fake.seed('telegramLinks/XYZ789', { uid: UID, email: 'vini@exemplo.com', expiresAt: { toDate: () => new Date('2026-10-14T16:00:00Z') } })
    await diz('/vincular XYZ789')
    expect(estado()).toMatchObject({ stepId: 'horario', data: {} })
  })
})

describe('caminho completo', () => {
  it('responde às 6 etapas com seleções e grava a configuração', async () => {
    await vincular()
    await diz('🌙 19h — Noite');            expect(estado().stepId).toBe('cartoes')
    await diz('✅ Sim');                     expect(estado().stepId).toBe('cartoes_aviso')
    await diz('/pular');                     expect(estado().stepId).toBe('orcamento')
    await diz('❌ Não');                     expect(estado().stepId).toBe('saldo_neg')
    await diz('✅ Sim');                     expect(estado().stepId).toBe('semanal')
    await diz('✅ Sim');                     expect(estado().stepId).toBe('semanal_dia')
    await diz('Segunda-feira')
    await diz('Sexta-feira')
    await diz('☑️ Confirmar seleção');       expect(estado().stepId).toBe('diario')
    await diz('✅ Sim');                     expect(estado().stepId).toBe('diario_dias')
    await diz('💼 Dias úteis (Seg–Sex)')

    expect(estado()).toBeUndefined() // onboarding encerrado
    expect(notificacoes()).toEqual({
      telegramEnabled: true,
      horaAlerta: 19,
      diasAntecedenciaVencimento: [3],
      diaSemanaResumo: [1, 5],
      diasResumoDiario: 'uteis',
      tipos: { n1: true, n2: true, n3: true, n4: false, n5: false, n6: true, n7: true, n8: true },
    })
    const resumo = ultimaMensagem()
    expect(resumo).toContain('Tudo configurado')
    expect(resumo).toContain('19h (noite)')
    expect(resumo).toContain('3d antes')
    expect(resumo).toContain('Seg, Sex')
    expect(resumo).toContain('dias úteis')
    expect(resumo).toContain('6 tipo(s) de alerta ativado(s)')
    expect(teclado()).toEqual({ remove_keyboard: true })
  })

  it('"Não" em tudo pula as perguntas dependentes e desliga os alertas', async () => {
    await vincular()
    await diz('7')
    await diz('Não');  expect(estado().stepId).toBe('orcamento') // pulou cartoes_aviso
    await diz('não');  await diz('nao')
    expect(estado().stepId).toBe('semanal')
    await diz('n');    expect(estado().stepId).toBe('diario')    // pulou semanal_dia
    await diz('Não')                                             // fim: pulou diario_dias
    expect(estado()).toBeUndefined()
    expect(notificacoes().tipos).toEqual({ n1: false, n2: false, n3: false, n4: false, n5: false, n6: false, n7: false, n8: false })
    expect(notificacoes().horaAlerta).toBe(7)
    expect(ultimaMensagem()).toContain('0 tipo(s) de alerta ativado(s)')
  })

  it('a pergunta de cada etapa mostra o número da etapa', async () => {
    await vincular()
    await diz('manhã'); expect(ultimaMensagem()).toContain('Etapa 2 de 6')
    await diz('sim');   expect(ultimaMensagem()).toContain('antecedência')
    await diz('/pular'); expect(ultimaMensagem()).toContain('Etapa 3 de 6')
    await diz('sim');   expect(ultimaMensagem()).toContain('Etapa 4 de 6')
    await diz('sim');   expect(ultimaMensagem()).toContain('Etapa 5 de 6')
    await diz('não');   expect(ultimaMensagem()).toContain('Etapa 6 de 6')
  })
})

describe('/pular usa o valor padrão de cada etapa', () => {
  it('pular tudo: 7h, todos os alertas ligados, 3 dias antes, segunda, todo dia', async () => {
    await vincular()
    for (let i = 0; i < 9; i++) await diz('/pular')
    expect(estado()).toBeUndefined()
    expect(notificacoes()).toEqual({
      telegramEnabled: true,
      horaAlerta: 7,
      diasAntecedenciaVencimento: [3],
      diaSemanaResumo: [1],
      diasResumoDiario: 'todos',
      tipos: { n1: true, n2: true, n3: true, n4: true, n5: true, n6: true, n7: true, n8: true },
    })
  })

  it('/skip também funciona', async () => {
    await vincular()
    await diz('/skip')
    expect(estado().stepId).toBe('cartoes')
    expect(estado().data.horaAlerta).toBe(7)
  })
})

describe('respostas inválidas e variações aceitas', () => {
  it('resposta fora das opções repete a pergunta com a dica e não avança', async () => {
    await vincular()
    await diz('talvez')
    expect(ultimaMensagem()).toContain('escolha um dos horários')
    expect(ultimaMensagem()).toContain('/pular')
    expect(estado()).toMatchObject({ stepId: 'horario', data: {} })
    expect(botoes()).toContain('🌅 7h — Manhã')
  })

  it.each([['7', 7], ['manhã', 7], ['12', 12], ['TARDE', 12], ['19h', 19], ['noite', 19]])('horário "%s" vale %s', async (texto, hora) => {
    await vincular()
    await diz(texto)
    expect(estado().data.horaAlerta).toBe(hora)
  })

  it.each(['sim', 'S', 'ok', 'quero', 'bora', 'claro', '✅ Sim'])('"%s" conta como sim', async (texto) => {
    await vincular()
    await diz('manhã')
    await diz(texto)
    expect(estado().data.tipos.n1).toBe(true)
  })

  it.each(['não', 'nao', 'n', 'pula', 'deixa', '❌ Não'])('"%s" conta como não', async (texto) => {
    await vincular()
    await diz('manhã')
    await diz(texto)
    expect(estado().data.tipos.n1).toBe(false)
  })

  it('"Sim/Não" inválido na etapa de cartão repete a pergunta sem avançar', async () => {
    await vincular()
    await diz('manhã')
    await diz('hmm')
    expect(estado().stepId).toBe('cartoes')
    expect(ultimaMensagem()).toContain('Resposta não reconhecida')
  })

  it('dias do resumo diário: "Todo dia", "Dias úteis" e "Final de semana"', async () => {
    for (const [texto, esperado] of [['🗓 Todo dia', 'todos'], ['💼 Dias úteis (Seg–Sex)', 'uteis'], ['😎 Final de semana (Sáb e Dom)', 'fds']]) {
      fake.limpar(); instalarTelegramFalso()
      await vincular()
      for (const r of ['manhã', 'não', 'não', 'não', 'não', 'sim']) await diz(r)
      expect(estado().stepId).toBe('diario_dias')
      await diz(texto)
      expect(notificacoes().diasResumoDiario).toBe(esperado)
    }
  })
})

describe('seleção múltipla', () => {
  const ateOsDias = async () => {
    await vincular()
    await diz('manhã'); await diz('sim')
    expect(estado().stepId).toBe('cartoes_aviso')
  }

  it('toque marca e desmarca; a seleção aparece na mensagem e no teclado', async () => {
    await ateOsDias()
    await diz('3 dias antes')
    expect(ultimaMensagem()).toContain('3 dias')
    expect(botoes()).toContain('✅ 3 dias antes')
    expect(estado().data.tempSelections).toEqual([3])
    await diz('✅ 3 dias antes') // tocar de novo desmarca
    expect(estado().data.tempSelections).toEqual([])
    expect(ultimaMensagem()).toContain('Nenhum selecionado')
  })

  it('confirmar sem nenhuma seleção avisa e não avança', async () => {
    await ateOsDias()
    await diz('☑️ Confirmar seleção')
    expect(ultimaMensagem()).toContain('pelo menos uma opção')
    expect(estado().stepId).toBe('cartoes_aviso')
  })

  it('texto fora das opções orienta o uso do teclado', async () => {
    await ateOsDias()
    await diz('10 dias')
    expect(ultimaMensagem()).toContain('Toque nas opções')
    expect(estado().stepId).toBe('cartoes_aviso')
  })

  it('ao confirmar, o valor escolhido fica guardado para a configuração', async () => {
    await ateOsDias()
    await diz('7 dias antes')
    await diz('☑️ Confirmar seleção')
    expect(estado().data.diasAntecedenciaVencimento).toEqual([7])
  })

  it('resumo semanal: aceita nomes curtos ("seg") e várias seleções, e /pular usa segunda', async () => {
    await vincular()
    for (const r of ['manhã', 'não', 'não', 'não', 'sim']) await diz(r)
    expect(estado().stepId).toBe('semanal_dia')
    await diz('Domingo'); await diz('Quarta-feira')
    expect(estado().data.tempSelections.sort()).toEqual([0, 3])
    await diz('☑️ Confirmar seleção')
    expect(estado().data.diaSemanaResumo).toEqual([0, 3])
  })
})

describe('comportamentos atuais registrados (ver relatório da avaliação)', () => {
  // Antes, set(merge:true) mesclava o mapa telegramOnboarding.data e a seleção temporária da etapa anterior ficava
  // gravada (aparecia pré-marcada na etapa seguinte). Agora o estado é substituído a cada passo.
  it('a seleção da etapa de cartão NÃO vaza para a de dias da semana', async () => {
    await vincular()
    await diz('manhã'); await diz('sim')
    await diz('3 dias antes')
    await diz('☑️ Confirmar seleção')
    expect(estado().data.tempSelections).toBeUndefined()
    for (const r of ['não', 'sim', 'sim']) await diz(r) // orçamento, saldo negativo, resumo semanal
    expect(estado().stepId).toBe('semanal_dia')
    expect(estado().data.tempSelections).toBeUndefined()
    expect(ultimaMensagem()).toContain('Nenhum selecionado')
    expect(botoes().some(b => b.startsWith('✅ '))).toBe(false)
  })

  it('confirmar o resumo semanal sem tocar em nada pede para escolher (não salva dia nenhum)', async () => {
    await vincular()
    await diz('manhã'); await diz('sim')
    await diz('3 dias antes'); await diz('☑️ Confirmar seleção')
    for (const r of ['não', 'sim', 'sim']) await diz(r)
    await diz('☑️ Confirmar seleção')
    expect(ultimaMensagem()).toContain('pelo menos uma opção')
    expect(estado().stepId).toBe('semanal_dia')
    expect(estado().data.diaSemanaResumo).toBeUndefined()
  })

  it('a seleção temporária nunca chega à configuração final', async () => {
    await vincular()
    await diz('manhã'); await diz('sim')
    await diz('3 dias antes'); await diz('☑️ Confirmar seleção')
    for (const r of ['não', 'sim', 'sim']) await diz(r)
    await diz('Segunda-feira'); await diz('☑️ Confirmar seleção')
    await diz('não')
    expect(estado()).toBeUndefined()
    expect(notificacoes().tempSelections).toBeUndefined()
    expect(notificacoes().diasAntecedenciaVencimento).toEqual([3])
    expect(notificacoes().diaSemanaResumo).toEqual([1])
  })

  it('quem estava no meio do fluxo com a sobra antiga gravada não leva a sobra para a configuração', async () => {
    await vincular()
    fake.seed(`users/${UID}`, { telegramChatId: '4242', telegramOnboarding: { active: true, stepId: 'diario', data: { horaAlerta: 7, tempSelections: [3] } } })
    await diz('não')
    expect(notificacoes().tempSelections).toBeUndefined()
  })

  it('horário "17h" não é aceito (antes virava 7h)', async () => {
    await vincular()
    await diz('17h')
    expect(estado().stepId).toBe('horario')
    expect(estado().data.horaAlerta).toBeUndefined()
    expect(ultimaMensagem()).toContain('escolha um dos horários')
  })

  it.each([['07h', 7], ['7h', 7], ['12h', 12], ['19h', 19], ['às 12', 12], ['🌙 19h — Noite', 19]])('horário "%s" continua sendo aceito', async (texto, hora) => {
    await vincular()
    await diz(texto)
    expect(estado().data.horaAlerta).toBe(hora)
  })

  it.each(['17', '117', '1912', '70', '8h', '24h'])('horário "%s" não é aceito', async (texto) => {
    await vincular()
    await diz(texto)
    expect(estado().stepId).toBe('horario')
  })

  it('horário sem nada reconhecível ("qualquer") não é aceito', async () => {
    await vincular()
    await diz('qualquer')
    expect(estado().stepId).toBe('horario')
  })

  it('etapa desconhecida gravada no estado reinicia a conversa (com e-mail vazio)', async () => {
    await vincular()
    fake.seed(`users/${UID}`, { telegramChatId: '4242', telegramOnboarding: { active: true, stepId: 'inexistente', data: {} } })
    await diz('oi')
    expect(mensagensEnviadas().some(t => t.includes('Conta vinculada com sucesso'))).toBe(true)
    expect(estado().stepId).toBe('horario')
  })

  it('outro chat não vinculado não é afetado pelo onboarding de alguém', async () => {
    await vincular()
    await diz('manhã', 777)
    expect(ultimaMensagem()).toContain('vincule sua conta')
    expect(estado().stepId).toBe('horario')
  })
})
