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

describe('N24 — reconhecimento do aporte pelas ocorrências', () => {
  const comRastreio = (sobraData, extra = {}) => fake.seed(`config/${UID}`, {
    reservaTracking: { sobraData, sobraValor: 3000, lastRemindData: null, ...extra },
  })

  it('aporte feito NO MESMO DIA em que a sobra foi detectada conta', async () => {
    comRastreio('2026-10-09')
    expect(await roda([entrada(9000), aporte(500, { dataInicio: '2026-10-09' })])).toBeNull()
    expect(tracking().sobraData).toBe('2026-10-14') // reiniciou
  })

  it('aporte mensal recorrente criado ANTES da sobra e que caiu depois dela é reconhecido', async () => {
    comRastreio('2026-10-01')
    const recorrente = aporte(500, { frequencia: 'mensal', dataInicio: '2026-01-10' }) // caiu em 10/10
    expect(await roda([entrada(9000), recorrente])).toBeNull()
    expect(tracking().sobraData).toBe('2026-10-14')
  })

  it('aporte semanal recorrente também', async () => {
    comRastreio('2026-10-08')
    expect(await roda([entrada(9000), aporte(100, { frequencia: 'semanal', dataInicio: '2026-06-03' })])).toBeNull()
  })

  it('aporte parcelado conta pela parcela que caiu no período', async () => {
    comRastreio('2026-10-01')
    const parcelado = aporte(300, { frequencia: 'parcelado', dataInicio: '2026-08-12', parcelaAtual: 1, totalParcelas: 6 }) // 12/10
    expect(await roda([entrada(9000), parcelado])).toBeNull()
  })

  it('recorrente cuja próxima data ainda não chegou NÃO conta: continua a cobrança', async () => {
    fake.seed(`config/${UID}`, { reservaTracking: { sobraData: '2026-10-05', sobraValor: 3000, lastRemindData: null } })
    const recorrente = aporte(500, { frequencia: 'mensal', dataInicio: '2026-01-25' }) // próxima: 25/10
    expect(await roda([entrada(9000), recorrente])).toContain('Aporte pendente')
  })

  it('ocorrência excluída do aporte recorrente não conta', async () => {
    fake.seed(`config/${UID}`, { reservaTracking: { sobraData: '2026-10-05', sobraValor: 3000, lastRemindData: null } })
    const recorrente = aporte(500, { frequencia: 'mensal', dataInicio: '2026-01-10', exclusoes: ['2026-10-10'] })
    expect(await roda([entrada(9000), recorrente])).toContain('Aporte pendente')
  })

  it('aporte agendado para o futuro (ainda não aconteceu) não encerra a cobrança', async () => {
    fake.seed(`config/${UID}`, { reservaTracking: { sobraData: '2026-10-05', sobraValor: 3000, lastRemindData: null } })
    expect(await roda([entrada(9000), aporte(500, { dataInicio: '2026-10-20' })])).toContain('Aporte pendente')
  })

  it('o aporte que reiniciou o rastreio não causa reinícios em cascata', async () => {
    comRastreio('2026-10-09')
    const txs = [entrada(9000), aporte(500, { dataInicio: '2026-10-14' })]
    await roda(txs) // 14/10: vê o aporte e reinicia com sobraData = 14/10
    expect(tracking().sobraData).toBe('2026-10-14')
    dia('2026-10-15')
    await roda(txs) // 15/10: o aporte de 14/10 conta mais uma vez (>= sobraData) e reinicia de novo
    expect(tracking().sobraData).toBe('2026-10-15')
    dia('2026-10-16')
    await roda(txs) // 16/10: agora o aporte (14/10) é anterior à sobraData (15/10): nada mais o reinicia
    expect(tracking().sobraData).toBe('2026-10-15')
    dia('2026-10-20')
    expect(await roda(txs)).toContain('Aporte pendente')
  })
})

describe('N24 — a sobra acabou', () => {
  const comRastreio = (sobraData, extra = {}) => fake.seed(`config/${UID}`, {
    reservaTracking: { sobraData, sobraValor: 3000, lastRemindData: null, ...extra },
  })

  it('rastreio antigo e sobra zerada: encerra o rastreio e não cobra', async () => {
    comRastreio('2026-10-05')
    expect(await roda([entrada(100)])).toBeNull()
    expect(tracking()).toBeUndefined()
  })

  it('sobra menor que a de antes: o aviso mostra o valor de hoje, não o antigo', async () => {
    comRastreio('2026-10-05')
    const msg = (await roda([entrada(800)])).replace(/[\u00a0\u202f]/g, ' ')
    expect(msg).toContain('R$ 800,00')
    expect(msg).not.toContain('R$ 3.000,00')
  })

  it('sobra maior que a de antes: continua mostrando o valor guardado (o que o usuário tinha)', async () => {
    comRastreio('2026-10-05', { sobraValor: 1000 })
    const msg = (await roda([entrada(8000)])).replace(/[\u00a0\u202f]/g, ' ')
    expect(msg).toContain('R$ 1.000,00')
  })

  it('sobra zerada mas dentro dos 5 dias: também encerra', async () => {
    comRastreio('2026-10-12')
    expect(await roda([entrada(100)])).toBeNull()
    expect(tracking()).toBeUndefined()
  })
})

describe('N24 — isolamento', () => {
  it('dados de outro usuário não interferem', async () => {
    fake.seed(`config/${UID}`, { reservaTracking: { sobraData: '2026-10-05', sobraValor: 3000, lastRemindData: null } })
    fake.seed('config/outro', { reservaTracking: { sobraData: '2026-09-01', sobraValor: 1, lastRemindData: null } })
    await roda([entrada(3000)])
    expect(fake.ler('config/outro').reservaTracking.sobraData).toBe('2026-09-01')
  })
})
