import { describe, it, expect } from 'vitest'
import { bot, fake, UID, fixarRelogio } from './helpers'
import { FieldValue } from './fakeFirestore'

/**
 * Prova de que a correção do N24 não mexe no caminho que já funcionava: em cenários com aportes únicos,
 * posteriores à data da sobra, o resultado (mensagem e estado gravado) é idêntico ao da versão antiga,
 * cuja lógica está copiada aqui como referência.
 */
fixarRelogio('2026-10-14T15:00:00Z')
const HOJE = '2026-10-14'
const formatBRL = bot.formatBRL

async function n24Antigo(uid, transactions, config, walletInitials) {
  const LIMIAR_DIAS = 5
  const hoje = new Date('2026-10-14T12:00:00Z')
  const sobra = bot.calcSobraSeguraBot(transactions, walletInitials, HOJE, hoje).investivel
  const tracking = config?.reservaTracking || {}
  const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000)
  const investedSince = tracking.sobraData
    ? transactions.some(t => t.tipo === 'investimento' && t.dataInicio > tracking.sobraData)
    : false
  if (investedSince || !tracking.sobraData) {
    if (sobra > 0) {
      await fake.db.collection('config').doc(uid).set({ reservaTracking: { sobraData: HOJE, sobraValor: sobra, lastRemindData: null } }, { merge: true })
    } else if (tracking.sobraData) {
      await fake.db.collection('config').doc(uid).set({ reservaTracking: FieldValue.delete() }, { merge: true })
    }
    return null
  }
  const diasSemAporte = daysBetween(tracking.sobraData, HOJE)
  if (diasSemAporte < LIMIAR_DIAS) return null
  const diasDesdeLembrete = tracking.lastRemindData ? daysBetween(tracking.lastRemindData, HOJE) : 999
  if (diasDesdeLembrete < LIMIAR_DIAS) return null
  await fake.db.collection('config').doc(uid).set({ reservaTracking: { ...tracking, lastRemindData: HOJE } }, { merge: true })
  const [, mm, dd] = tracking.sobraData.split('-')
  return `🔔 *Aporte pendente!*\n\nVocê tinha *${formatBRL(tracking.sobraValor)}* disponíveis para guardar ou investir desde ${dd}/${mm} e ainda não registrou nenhum aporte.\n\n_Que tal lançar agora no app?_`
}

let semente = 4242
const rnd = () => (semente = (semente * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
const pick = (a) => a[Math.floor(rnd() * a.length)]
const diasAtras = (n) => new Date(Date.UTC(2026, 9, 14 - n)).toISOString().slice(0, 10)

describe('N24 novo × antigo (aportes únicos posteriores à sobra)', () => {
  it('300 cenários dão a mesma mensagem e o mesmo estado', async () => {
    let comMensagem = 0, comReinicio = 0, comApagar = 0, semSobraMaisSemAporte = 0
    for (let k = 0; k < 300; k++) {
      const txs = [{ id: 'sal', tipo: 'entrada', frequencia: 'unico', dataInicio: '2026-10-01', valor: pick([150, 900, 3000, 8000]), descricao: 'Salário' }]
      if (rnd() < 0.3) txs.push({ id: 'gasto', tipo: 'saida', frequencia: 'unico', dataInicio: '2026-10-05', valor: pick([100, 800, 2500]), descricao: 'Gasto', categoria: 'conforto' })

      const comRastreio = rnd() < 0.8
      const sobraData = diasAtras(1 + Math.floor(rnd() * 12))

      // aportes únicos, nunca no mesmo dia da sobra nem no futuro: ou claramente depois, ou claramente antes
      let aportouDepois = false
      const n = Math.floor(rnd() * 3)
      for (let i = 0; i < n; i++) {
        const depois = rnd() < 0.5
        if (depois && comRastreio) aportouDepois = true
        txs.push({
          id: `a${i}`, tipo: 'investimento', frequencia: 'unico', valor: pick([50, 300]), descricao: 'Aporte',
          dataInicio: depois && comRastreio ? diasAtrasDepois(sobraData) : diasAtras(14 + Math.floor(rnd() * 5)),
        })
      }

      // a sobra de hoje (já descontados os aportes) limita o valor que o rastreio antigo guardou
      const sobraAtual = bot.calcSobraSeguraBot(txs, 0, HOJE, new Date('2026-10-14T12:00:00Z')).investivel
      const tracking = comRastreio
        ? { sobraData, sobraValor: Math.max(1, Math.min(sobraAtual || 1, pick([200, 500, 3000]))), lastRemindData: rnd() < 0.5 ? null : diasAtras(Math.floor(rnd() * 10)) }
        : undefined

      fake.limpar(); fake.seed(`config/${UID}`, tracking ? { reservaTracking: tracking } : {})
      const msgAntiga = await n24Antigo(UID, txs, fake.ler(`config/${UID}`), 0)
      const estadoAntigo = fake.ler(`config/${UID}`).reservaTracking

      fake.limpar(); fake.seed(`config/${UID}`, tracking ? { reservaTracking: tracking } : {})
      const resNova = await bot.checkN24AportePerdido(UID, txs, fake.ler(`config/${UID}`), 0, { n24: true })
      if (resNova) await resNova.confirmar()
      const msgNova = resNova ? resNova.text : null
      const estadoNovo = fake.ler(`config/${UID}`).reservaTracking

      if (tracking && sobraAtual <= 0 && !aportouDepois) {
        // única mudança intencional: a sobra acabou e não houve aporte -> encerra o rastreio em vez de cobrar
        expect({ msg: msgNova, estado: estadoNovo }, `cenário ${k}`).toEqual({ msg: null, estado: undefined })
        semSobraMaisSemAporte++
        continue
      }
      expect({ msg: msgNova, estado: estadoNovo }, `cenário ${k}`).toEqual({ msg: msgAntiga, estado: estadoAntigo })
      if (msgAntiga) comMensagem++
      if (estadoAntigo && estadoAntigo.sobraData === HOJE) comReinicio++
      if (tracking && !estadoAntigo) comApagar++
    }
    // os cenários realmente exercitam os três desfechos
    expect(comMensagem).toBeGreaterThan(10)
    expect(comReinicio).toBeGreaterThan(10)
    expect(comApagar).toBeGreaterThan(0)
    expect(semSobraMaisSemAporte).toBeGreaterThan(0)
  })
})

// um dia depois da data da sobra, nunca no mesmo dia nem depois de hoje
function diasAtrasDepois(sobraData) {
  const d = new Date(`${sobraData}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  const s = d.toISOString().slice(0, 10)
  return s > HOJE ? HOJE : s
}
