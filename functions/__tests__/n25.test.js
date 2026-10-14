import { describe, it, expect, beforeEach, vi } from 'vitest'
import { bot, fake, UID, fixarRelogio } from './helpers'

/**
 * N25 — categoria acima da média dos últimos meses. Compara o mês atual com a média dos até 3 meses
 * anteriores que tiveram despesas; avisa a categoria que passar de 130% da média (e com média >= R$ 50),
 * no máximo uma vez por categoria e por mês. Hoje = 14/10/2026 (meses de histórico: jul, ago, set).
 */
fixarRelogio('2026-10-14T15:00:00Z')

let seq = 0
const gasto = (valor, categoria, mes, extra = {}) => ({
  id: `g${++seq}`, tipo: 'saida', frequencia: 'unico', dataInicio: `${mes}-10`, descricao: 'Compra', valor, categoria, ...extra,
})
/** Histórico igual em jul/ago/set para a categoria. */
const historico = (valor, categoria, meses = ['2026-07', '2026-08', '2026-09']) => meses.map(m => gasto(valor, categoria, m))

const roda = async (txs, { config, tipos = { n25: true } } = {}) => {
  const cfg = config ?? fake.ler(`config/${UID}`) ?? {}
  return bot.checkN25AcimaDaMedia(UID, txs, cfg, tipos)
}
const txt = (r) => (r ? r.text.replace(/[  ]/g, ' ') : null)
const estado = () => fake.ler(`config/${UID}`)?.alertasAcimaMedia

beforeEach(() => {
  fake.limpar()
  fake.seed(`config/${UID}`, {})
})

describe('N25 — limites', () => {
  it('exatamente 130% da média avisa', async () => {
    const r = await roda([...historico(1000, 'conforto'), gasto(1300, 'conforto', '2026-10')])
    expect(txt(r)).toContain('Conforto')
    expect(txt(r)).toContain('30% acima')
  })

  it('um real abaixo de 130% não avisa', async () => {
    expect(await roda([...historico(1000, 'conforto'), gasto(1299, 'conforto', '2026-10')])).toBeNull()
  })

  it('média abaixo de R$ 50 é ignorada, mesmo com gasto muito maior', async () => {
    expect(await roda([...historico(40, 'prazeres'), gasto(400, 'prazeres', '2026-10')])).toBeNull()
  })

  it('média de R$ 50 já conta', async () => {
    expect(txt(await roda([...historico(50, 'prazeres'), gasto(200, 'prazeres', '2026-10')]))).toContain('Prazeres')
  })

  it('gasto no mês abaixo da média não avisa', async () => {
    expect(await roda([...historico(1000, 'conforto'), gasto(500, 'conforto', '2026-10')])).toBeNull()
  })

  it('opção n25 desligada: não avisa', async () => {
    expect(await roda([...historico(1000, 'conforto'), gasto(2000, 'conforto', '2026-10')], { tipos: { n25: false } })).toBeNull()
  })
})

describe('N25 — histórico', () => {
  it('menos de 2 meses de histórico: não avisa', async () => {
    expect(await roda([...historico(1000, 'conforto', ['2026-09']), gasto(5000, 'conforto', '2026-10')])).toBeNull()
  })

  it('2 meses de histórico já bastam, e a média é só dos meses com despesa', async () => {
    const txs = [...historico(1000, 'conforto', ['2026-08', '2026-09']), gasto(1400, 'conforto', '2026-10')]
    const r = await roda(txs)
    expect(txt(r)).toContain('últimos 2 meses')
    expect(txt(r)).toContain('R$ 1.000,00')
  })

  it('média de 3 meses diferentes', async () => {
    const txs = [
      gasto(600, 'conforto', '2026-07'), gasto(900, 'conforto', '2026-08'), gasto(1500, 'conforto', '2026-09'),
      gasto(1560, 'conforto', '2026-10'), // média 1000 -> 156%
    ]
    const r = await roda(txs)
    expect(txt(r)).toContain('56% acima')
    expect(txt(r)).toContain('últimos 3 meses')
  })

  it('despesa só nos meses anteriores a 3 meses atrás não entra', async () => {
    const txs = [...historico(1000, 'conforto', ['2026-05', '2026-06']), gasto(5000, 'conforto', '2026-10')]
    expect(await roda(txs)).toBeNull()
  })
})

describe('N25 — categorias', () => {
  it('Liberdade e Sem categoria nunca geram aviso (investir mais não é alerta)', async () => {
    const txs = [
      ...historico(1000, 'liberdade'), gasto(5000, 'liberdade', '2026-10'),
      ...historico(1000, 'sem_categoria'), gasto(5000, 'sem_categoria', '2026-10'),
    ]
    expect(await roda(txs)).toBeNull()
  })

  it('categoria desconhecida vira "sem categoria" e não derruba o aviso', async () => {
    const txs = [...historico(1000, 'outros_inventada'), gasto(5000, 'outros_inventada', '2026-10')]
    expect(await roda(txs)).toBeNull()
  })

  it('várias categorias na mesma mensagem, da maior para a menor alta', async () => {
    const txs = [
      ...historico(1000, 'conforto'), gasto(1400, 'conforto', '2026-10'), // +40%
      ...historico(500, 'prazeres'), gasto(1000, 'prazeres', '2026-10'),  // +100%
    ]
    const t = txt(await roda(txs))
    expect(t.indexOf('Prazeres')).toBeLessThan(t.indexOf('Conforto'))
    expect(t).toContain('100% acima')
  })

  it('o atalho /gastos aponta para a categoria com maior alta', async () => {
    const txs = [...historico(500, 'prazeres'), gasto(1000, 'prazeres', '2026-10')]
    expect(txt(await roda(txs))).toContain('/gastos prazeres')
  })

  it('gasto à vista no cartão conta na data da compra (competência)', async () => {
    const compraCartao = {
      id: 'c', tipo: 'cartao', frequencia: 'unico', cartaoId: 'c1', descricao: 'Fatura', dataInicio: '2026-11-10', valor: 1400,
      itens: [{ descricao: 'Compra', valor: 1400, categoria: 'conforto', dataCompra: '2026-10-05' }],
    }
    expect(txt(await roda([...historico(1000, 'conforto'), compraCartao]))).toContain('Conforto')
  })
})

describe('N25 — uma vez por categoria e mês', () => {
  const base = () => [...historico(1000, 'conforto'), ...historico(500, 'prazeres'), gasto(1500, 'conforto', '2026-10')]

  it('a mensagem sozinha não grava nada: o estado só vale depois de confirmar o envio', async () => {
    const r = await roda(base())
    expect(r).not.toBeNull()
    expect(estado()).toBeUndefined()
  })

  it('confirmado o envio, a categoria não é avisada de novo no mesmo mês', async () => {
    const r = await roda(base())
    await r.confirmar()
    expect(estado()).toEqual({ '2026-10': ['conforto'] })
    expect(await roda(base())).toBeNull()
  })

  it('sem confirmar (envio falhou), o aviso é refeito no ciclo seguinte', async () => {
    await roda(base())
    expect(await roda(base())).not.toBeNull()
  })

  it('outra categoria que estoura depois, no mesmo mês, ainda é avisada (e a antiga não repete)', async () => {
    const r1 = await roda(base())
    await r1.confirmar()
    const r2 = await roda([...base(), gasto(900, 'prazeres', '2026-10')])
    expect(txt(r2)).toContain('Prazeres')
    expect(txt(r2)).not.toContain('Conforto')
    await r2.confirmar()
    expect(estado()['2026-10'].sort()).toEqual(['conforto', 'prazeres'])
  })

  it('no mês seguinte a categoria pode ser avisada de novo e os meses antigos são descartados', async () => {
    const r1 = await roda(base())
    await r1.confirmar()
    vi.setSystemTime(new Date('2026-11-14T15:00:00Z'))
    const txs = [
      ...historico(1000, 'conforto', ['2026-08', '2026-09', '2026-10']), gasto(1500, 'conforto', '2026-11'),
    ]
    const r2 = await roda(txs)
    expect(txt(r2)).toContain('Conforto')
    await r2.confirmar()
    expect(estado()).toEqual({ '2026-11': ['conforto'] })
  })

  it('não mexe no estado de outro usuário', async () => {
    fake.seed('config/outro', { alertasAcimaMedia: { '2026-10': ['x'] } })
    const r = await roda(base())
    await r.confirmar()
    expect(fake.ler('config/outro').alertasAcimaMedia).toEqual({ '2026-10': ['x'] })
  })
})
