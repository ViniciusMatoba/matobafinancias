import { describe, it, expect, beforeEach, vi } from 'vitest'
import { bot, fake, UID, fixarRelogio } from './helpers'

/**
 * N24 — alerta de aporte perdido. Máquina de estados guardada em config/{uid}.reservaTracking:
 *   sem rastreio + sobra  -> começa a rastrear (sem avisar)
 *   aportou desde então   -> reinicia (ou apaga se não há mais sobra)
 *   5 dias sem aportar    -> avisa; só repete depois de mais 5 dias
 */
fixarRelogio('2026-10-14T15:00:00Z')

const dia = (iso) => vi.setSystemTime(new Date(`${iso}T15:00:00Z`))
const ligado = { n24: true }
let seq = 0
const entrada = (valor, extra = {}) => ({ id: `e${++seq}`, tipo: 'entrada', frequencia: 'unico', dataInicio: '2026-10-01', descricao: 'Salário', valor, ...extra })
const aporte = (valor, extra = {}) => ({ id: `a${++seq}`, tipo: 'investimento', frequencia: 'unico', dataInicio: '2026-10-10', descricao: 'Aporte', valor, ...extra })

const tracking = () => fake.ler(`config/${UID}`)?.reservaTracking
/** Roda o N24 com o config que está no banco (como o agendador faz no início da execução). */
const roda = async (txs, { tipos = ligado, wallet = 0 } = {}) => {
  const config = fake.ler(`config/${UID}`) || {}
  return bot.checkN24AportePerdido(UID, txs, config, wallet, tipos)
}

beforeEach(() => {
  fake.limpar()
  fake.seed(`config/${UID}`, {})
  dia('2026-10-14')
})

describe('N24 — início do rastreio', () => {
  it('sem rastreio e com sobra: começa a rastrear e não avisa', async () => {
    expect(await roda([entrada(3000)])).toBeNull()
    expect(tracking()).toEqual({ sobraData: '2026-10-14', sobraValor: 3000, lastRemindData: null })
  })

  it('sem rastreio e sobra abaixo de R$ 200: não rastreia nada', async () => {
    expect(await roda([entrada(150)])).toBeNull()
    expect(tracking()).toBeUndefined()
  })

  it('sem nenhum lançamento: nada acontece', async () => {
    expect(await roda([])).toBeNull()
    expect(tracking()).toBeUndefined()
  })

  it('opção n24 desligada: não rastreia nem avisa', async () => {
    expect(await roda([entrada(3000)], { tipos: { n24: false } })).toBeNull()
    expect(tracking()).toBeUndefined()
  })

  it('carteira com saldo inicial conta para a sobra', async () => {
    await roda([], { wallet: 1000 })
    expect(tracking()).toMatchObject({ sobraValor: 1000 })
  })
})

describe('N24 — cobrança', () => {
  const comRastreio = (sobraData, extra = {}) => fake.seed(`config/${UID}`, {
    reservaTracking: { sobraData, sobraValor: 3000, lastRemindData: null, ...extra },
  })

  it('antes de 5 dias sem aporte: não avisa', async () => {
    comRastreio('2026-10-10') // 4 dias
    expect(await roda([entrada(3000)])).toBeNull()
  })

  it('com 5 dias sem aporte: avisa com o valor e a data, e grava o lembrete', async () => {
    comRastreio('2026-10-09') // 5 dias
    const msg = (await roda([entrada(3000)])).replace(/[  ]/g, ' ')
    expect(msg).toContain('Aporte pendente')
    expect(msg).toContain('R$ 3.000,00')
    expect(msg).toContain('desde 09/10')
    expect(tracking().lastRemindData).toBe('2026-10-14')
    expect(tracking().sobraData).toBe('2026-10-09')
  })

  it('lembrete recente (menos de 5 dias): não repete', async () => {
    comRastreio('2026-10-01', { lastRemindData: '2026-10-11' })
    expect(await roda([entrada(3000)])).toBeNull()
  })

  it('lembrete de 5 dias atrás: repete', async () => {
    comRastreio('2026-10-01', { lastRemindData: '2026-10-09' })
    expect(await roda([entrada(3000)])).toContain('Aporte pendente')
    expect(tracking().lastRemindData).toBe('2026-10-14')
  })

  it('sequência de dias: começa, espera, avisa, espera, avisa de novo', async () => {
    const txs = [entrada(3000)]
    const dias = ['2026-10-14', '2026-10-16', '2026-10-19', '2026-10-21', '2026-10-24']
    const avisos = []
    for (const d of dias) {
      dia(d)
      avisos.push(!!(await roda(txs)))
    }
    // 14: começa | 16: 2 dias | 19: 5 dias -> avisa | 21: 2 dias do lembrete | 24: 5 dias do lembrete -> avisa
    expect(avisos).toEqual([false, false, true, false, true])
  })
})

describe('N24 — quando o usuário aporta', () => {
  const comRastreio = (sobraData) => fake.seed(`config/${UID}`, {
    reservaTracking: { sobraData, sobraValor: 3000, lastRemindData: '2026-10-12' },
  })

  it('aportou depois da sobra e ainda há sobra: reinicia o rastreio de hoje, sem avisar', async () => {
    comRastreio('2026-10-05')
    expect(await roda([entrada(9000), aporte(500, { dataInicio: '2026-10-10' })])).toBeNull()
    expect(tracking()).toEqual({ sobraData: '2026-10-14', sobraValor: 8500, lastRemindData: null })
  })

  it('aportou e não sobrou nada: apaga o rastreio', async () => {
    comRastreio('2026-10-05')
    expect(await roda([entrada(500), aporte(500, { dataInicio: '2026-10-10' })])).toBeNull()
    expect(tracking()).toBeUndefined()
  })

  it('aporte antes da data da sobra não conta como resposta', async () => {
    fake.seed(`config/${UID}`, { reservaTracking: { sobraData: '2026-10-09', sobraValor: 3000, lastRemindData: null } })
    expect(await roda([entrada(9000), aporte(500, { dataInicio: '2026-10-03' })])).toContain('Aporte pendente')
  })
})

describe('N24 — comportamentos atuais registrados (ver relatório da avaliação)', () => {
  const comRastreio = (sobraData) => fake.seed(`config/${UID}`, {
    reservaTracking: { sobraData, sobraValor: 3000, lastRemindData: null },
  })

  // A conferência usa t.dataInicio > sobraData (estritamente maior): aporte no mesmo dia não vale
  it('aporte feito NO MESMO DIA em que a sobra foi detectada não conta, e o usuário é cobrado', async () => {
    comRastreio('2026-10-09')
    const msg = await roda([entrada(9000), aporte(500, { dataInicio: '2026-10-09' })])
    expect(msg).toContain('Aporte pendente')
  })

  // A conferência olha a data de INÍCIO do lançamento, não as ocorrências: um aporte mensal criado
  // antes da sobra nunca é reconhecido, mesmo caindo todo mês
  it('aporte mensal recorrente criado antes da sobra não é reconhecido: o usuário é cobrado mesmo aportando', async () => {
    comRastreio('2026-10-01')
    const recorrente = aporte(500, { frequencia: 'mensal', dataInicio: '2026-01-10' }) // caiu em 10/10
    expect(await roda([entrada(9000), recorrente])).toContain('Aporte pendente')
  })

  it('aporte recorrente criado depois da sobra é reconhecido', async () => {
    comRastreio('2026-10-01')
    const recorrente = aporte(500, { frequencia: 'mensal', dataInicio: '2026-10-10' })
    expect(await roda([entrada(9000), recorrente])).toBeNull()
  })

  // Com rastreio ativo e sem aporte, o aviso sai mesmo que a sobra tenha acabado (usa o valor antigo)
  it('a sobra acabou mas o rastreio antigo continua cobrando o valor de antes', async () => {
    comRastreio('2026-10-05')
    const msg = (await roda([entrada(100)])).replace(/[  ]/g, ' ')
    expect(msg).toContain('R$ 3.000,00')
  })

  it('dados de outro usuário não interferem', async () => {
    comRastreio('2026-10-05')
    fake.seed('config/outro', { reservaTracking: { sobraData: '2026-09-01', sobraValor: 1, lastRemindData: null } })
    await roda([entrada(3000)])
    expect(fake.ler('config/outro').reservaTracking.sobraData).toBe('2026-09-01')
  })
})
