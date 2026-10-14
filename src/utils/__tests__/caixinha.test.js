import { describe, it, expect } from 'vitest'
import { saldoCaixinha, reservaDaCaixinha, acharCaixinhaReserva, resumoReservaHome } from '../caixinha'

/** Banner da Home: situação da reserva de emergência (mesmo saldo da tela Metas). */

const GOAL = { id: 'g1', nome: 'Reserva de Emergência', metaFinal: 10000 }
const aporte = (valor, extra = {}) => ({ id: `a${Math.random()}`, tipo: 'investimento', frequencia: 'unico', dataInicio: '2026-09-10', valor, metaId: 'g1', ...extra })
const saida = (valor, extra = {}) => ({ id: `s${Math.random()}`, tipo: 'saida', frequencia: 'unico', dataInicio: '2026-09-15', valor, metaId: 'g1', ...extra })

describe('acharCaixinhaReserva', () => {
  it('a caixinha escolhida na tela Investir tem prioridade, mesmo com outro nome', () => {
    const goals = [GOAL, { id: 'g2', nome: 'Colchão' }]
    expect(acharCaixinhaReserva(goals, { investimentos: { reservaGoalId: 'g2' } }).id).toBe('g2')
  })

  it('sem escolha, acha pelo nome (sem diferenciar acento nem maiúsculas)', () => {
    expect(acharCaixinhaReserva([{ id: 'x', nome: 'Viagem' }, { id: 'y', nome: 'RESERVA DE EMERGENCIA' }], {}).id).toBe('y')
    expect(acharCaixinhaReserva([{ id: 'z', nome: 'Minha reserva de emergência 2027' }], undefined).id).toBe('z')
  })

  it('escolha que não existe mais cai para a busca por nome', () => {
    expect(acharCaixinhaReserva([GOAL], { investimentos: { reservaGoalId: 'apagada' } }).id).toBe('g1')
  })

  it('sem caixinha de reserva devolve null', () => {
    expect(acharCaixinhaReserva([{ id: 'x', nome: 'Viagem' }], {})).toBeNull()
    expect(acharCaixinhaReserva(undefined, {})).toBeNull()
  })
})

describe('resumoReservaHome — saldo', () => {
  it('aportes na caixinha SOMAM (antes saíam negativos pelo sinal do caixa)', () => {
    const r = resumoReservaHome({ goals: [GOAL], transactions: [aporte(3000), aporte(2000)], config: {} })
    expect(r.saldo).toBe(5000)
  })

  it('retirada (saída) da caixinha subtrai; nunca fica negativo', () => {
    expect(resumoReservaHome({ goals: [GOAL], transactions: [aporte(3000), saida(1000)], config: {} }).saldo).toBe(2000)
    expect(resumoReservaHome({ goals: [GOAL], transactions: [aporte(100), saida(900)], config: {} }).saldo).toBe(0)
  })

  it('aporte recorrente conta uma vez, como na tela Metas', () => {
    const r = resumoReservaHome({ goals: [GOAL], transactions: [aporte(500, { frequencia: 'mensal', dataInicio: '2026-01-10' })], config: {} })
    expect(r.saldo).toBe(500)
  })

  it('só conta lançamentos ligados a ESTA caixinha', () => {
    const txs = [aporte(1000), aporte(7000, { metaId: 'outra' }), aporte(5000, { metaId: undefined })]
    expect(resumoReservaHome({ goals: [GOAL], transactions: txs, config: {} }).saldo).toBe(1000)
  })

  it('bate com a conta literal da tela Metas (saída subtrai, o resto soma)', () => {
    const txs = [aporte(300), { id: 'e', tipo: 'entrada', frequencia: 'unico', dataInicio: '2026-09-01', valor: 200, metaId: 'g1' }, saida(120)]
    const metas = txs.filter(t => t.metaId === 'g1').reduce((acc, t) => (t.tipo === 'saida' ? acc - t.valor : acc + t.valor), 0)
    expect(saldoCaixinha(txs, 'g1')).toBe(metas)
    expect(resumoReservaHome({ goals: [GOAL], transactions: txs, config: {} }).saldo).toBe(metas)
    expect(reservaDaCaixinha(txs, [GOAL], 'g1')).toBe(metas)
  })
})

describe('resumoReservaHome — meta e situação', () => {
  it('meta da própria caixinha; concluída quando o saldo alcança a meta', () => {
    const r = resumoReservaHome({ goals: [GOAL], transactions: [aporte(10000)], config: {} })
    expect(r).toMatchObject({ exists: true, metaFinal: 10000, saldo: 10000, completed: true, semMeta: false })
  })

  it('abaixo da meta não está concluída', () => {
    expect(resumoReservaHome({ goals: [GOAL], transactions: [aporte(9999)], config: {} }).completed).toBe(false)
  })

  it('caixinha sem meta usa a do perfil da tela Investir (despesas × meses)', () => {
    const goal = { id: 'g1', nome: 'Reserva de Emergência' }
    const config = { investimentos: { perfil: 'clt', despesasMens: 3000, mesesMeta: 6 } }
    const r = resumoReservaHome({ goals: [goal], transactions: [aporte(18000)], config })
    expect(r).toMatchObject({ metaFinal: 18000, completed: true, semMeta: false })
  })

  it('a meta da caixinha vale mais que a do perfil', () => {
    const config = { investimentos: { despesasMens: 3000, mesesMeta: 6 } }
    expect(resumoReservaHome({ goals: [GOAL], transactions: [], config }).metaFinal).toBe(10000)
  })

  it('sem meta nenhuma: semMeta (o banner pede para definir) e nunca "concluída"', () => {
    const r = resumoReservaHome({ goals: [{ id: 'g1', nome: 'Reserva de Emergência' }], transactions: [aporte(5000)], config: {} })
    expect(r).toMatchObject({ semMeta: true, completed: false, saldo: 5000 })
  })

  it('sem caixinha de reserva: não existe, com meta recomendada de 6 meses de custos fixos', () => {
    const r = resumoReservaHome({ goals: [], transactions: [], config: { rendaMensal: 10000, budgetPcts: { custos_fixos: 30 } } })
    expect(r).toMatchObject({ exists: false, saldo: 0, completed: false, metaRecomendada: 18000 })
  })

  it('meta recomendada padrão (sem renda) é 6 × R$ 1.500', () => {
    expect(resumoReservaHome({ goals: [], transactions: [], config: {} }).metaRecomendada).toBe(9000)
  })

  it('usa 30% como custos fixos quando o orçamento não define', () => {
    expect(resumoReservaHome({ goals: [], transactions: [], config: { rendaMensal: 5000, budgetPcts: {} } }).metaRecomendada).toBe(9000)
  })

  it('entradas indefinidas não quebram', () => {
    expect(() => resumoReservaHome({ goals: undefined, transactions: undefined, config: undefined })).not.toThrow()
  })
})
