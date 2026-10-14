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
    // toMatchObject: a seleção temporária que sobra no final é um defeito registrado mais abaixo
    expect(notificacoes()).toMatchObject({
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
  // setDoc(..., { merge: true }) do Firestore MESCLA mapas aninhados: o telegramOnboarding.data novo não apaga
  // as chaves que já estavam lá. A seleção temporária (tempSelections) da etapa anterior, removida em memória
  // ao confirmar, continua gravada e aparece como se já estivesse marcada na próxima etapa de seleção múltipla.
  it('a seleção da etapa de cartão vaza para a etapa de dias da semana (aparece pré-marcada)', async () => {
    await vincular()
    await diz('manhã'); await diz('sim')
    await diz('3 dias antes')
    await diz('☑️ Confirmar seleção')
    for (const r of ['não', 'sim', 'sim']) await diz(r) // orçamento, saldo negativo, resumo semanal
    expect(estado().stepId).toBe('semanal_dia')
    expect(estado().data.tempSelections).toEqual([3])        // sobra da etapa anterior
    expect(ultimaMensagem()).toContain('Qua')                 // a quarta já aparece como selecionada
  })

  it('confirmar o resumo semanal sem tocar em nada salva o dia que veio do vazamento (quarta)', async () => {
    await vincular()
    await diz('manhã'); await diz('sim')
    await diz('3 dias antes'); await diz('☑️ Confirmar seleção')
    for (const r of ['não', 'sim', 'sim']) await diz(r)
    await diz('☑️ Confirmar seleção')
    expect(estado().data.diaSemanaResumo).toEqual([3])
  })

  it('o vazamento também chega ao final: tempSelections acaba gravado em notificacoes', async () => {
    await vincular()
    await diz('manhã'); await diz('sim')
    await diz('3 dias antes'); await diz('☑️ Confirmar seleção')
    for (const r of ['não', 'não', 'não', 'não']) await diz(r) // orçamento, saldo, semanal e diário: tudo não
    expect(estado()).toBeUndefined()
    expect(notificacoes().tempSelections).toEqual([3])
  })

  // processUpdate entrega TODAS as mensagens ao onboarding enquanto ele está ativo
  it('durante o onboarding os outros comandos não funcionam (são tratados como resposta inválida)', async () => {
    await vincular()
    fake.seed(`transactions/${UID}/entries/e1`, { tipo: 'entrada', frequencia: 'unico', dataInicio: '2026-10-01', valor: 500, descricao: 'x' })
    await diz('/saldo')
    expect(ultimaMensagem()).not.toContain('Saldo Global')
    expect(ultimaMensagem()).toContain('escolha um dos horários')
    expect(estado().stepId).toBe('horario')
  })

  it('/ajuda também é interceptada durante o onboarding', async () => {
    await vincular()
    await diz('/ajuda')
    expect(ultimaMensagem()).toContain('escolha um dos horários')
  })

  // O onboarding grava os tipos em notificacoes.tipos; o agendador do Telegram usa telegramTipos quando ele existe
  it('quem já tem telegramTipos (do app) continua com eles: as escolhas do onboarding não valem para o Telegram', async () => {
    await vincular()
    fake.seed(`config/${UID}`, { notificacoes: { telegramTipos: { n1: true, n4: true } } })
    for (const r of ['manhã', 'não', 'não', 'não', 'não', 'não']) await diz(r)
    const n = notificacoes()
    expect(n.tipos.n1).toBe(false)           // o onboarding desligou
    expect(n.telegramTipos).toEqual({ n1: true, n4: true }) // mas o que o Telegram realmente usa não mudou
    const usadoPeloAgendador = n.telegramTipos !== undefined ? n.telegramTipos : n.tipos
    expect(usadoPeloAgendador.n1).toBe(true)
  })

  // O reconhecimento do horário só procura "7", "7h", "12"... dentro do texto: "17h" vira 7h da manhã
  it('horário "17h" é entendido como 7h (o reconhecimento procura o dígito, não o número inteiro)', async () => {
    await vincular()
    await diz('17h')
    expect(estado().data.horaAlerta).toBe(7)
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
