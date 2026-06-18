import { describe, it, expect, vi, beforeEach } from 'vitest'

// Fixa "hoje" em 2026-06-17 para tornar todos os testes determinísticos
vi.mock('../formatters', async (importOriginal) => {
  const real = await importOriginal()
  return { ...real, todayStr: () => '2026-06-17' }
})

import { expandOccurrences, calcSaldo, buildDailyProjection, calcularSobraSegura, getClosingDate, calcFaturaCard } from '../projectionCalc'
import { getProximoVencimento } from '../formatters'

// ── helpers ─────────────────────────────────────────────────────────────────
const tx = (overrides) => ({
  id: 'tx1',
  tipo: 'saida',
  frequencia: 'unico',
  valor: 100,
  dataInicio: '2026-06-17',
  exclusoes: [],
  ...overrides,
})

const entrada = (overrides) => tx({ tipo: 'entrada', ...overrides })

// ── expandOccurrences — unico ────────────────────────────────────────────────
describe('expandOccurrences — unico', () => {
  it('retorna 1 ocorrência quando dataInicio está no range', () => {
    const result = expandOccurrences(tx(), '2026-06-01', '2026-06-30')
    expect(result).toHaveLength(1)
    expect(result[0].date).toBe('2026-06-17')
    expect(result[0].valor).toBe(100)
    expect(result[0].sinal).toBe(-1)
  })

  it('retorna 0 ocorrências fora do range', () => {
    const result = expandOccurrences(tx({ dataInicio: '2026-05-01' }), '2026-06-01', '2026-06-30')
    expect(result).toHaveLength(0)
  })

  it('respeita exclusão: data excluída não aparece', () => {
    const result = expandOccurrences(
      tx({ exclusoes: ['2026-06-17'] }),
      '2026-06-01', '2026-06-30'
    )
    expect(result).toHaveLength(0)
  })

  it('sinal positivo para entradas', () => {
    const result = expandOccurrences(entrada(), '2026-06-01', '2026-06-30')
    expect(result[0].sinal).toBe(1)
  })
})

// ── expandOccurrences — mensal ───────────────────────────────────────────────
describe('expandOccurrences — mensal', () => {
  it('gera 12 ocorrências em 12 meses', () => {
    const result = expandOccurrences(
      tx({ frequencia: 'mensal', dataInicio: '2026-01-15' }),
      '2026-01-01', '2026-12-31'
    )
    expect(result).toHaveLength(12)
  })

  it('preserva dia 31 mês a mês (jan→mar pulando fev)', () => {
    const result = expandOccurrences(
      tx({ frequencia: 'mensal', dataInicio: '2026-01-31' }),
      '2026-01-01', '2026-03-31'
    )
    const dates = result.map(r => r.date)
    expect(dates).toContain('2026-01-31')
    expect(dates).toContain('2026-02-28') // clamp em fev
    expect(dates).toContain('2026-03-31') // recupera 31 em mar
  })

  it('respeita dataFim', () => {
    const result = expandOccurrences(
      tx({ frequencia: 'mensal', dataInicio: '2026-01-15', dataFim: '2026-03-15' }),
      '2026-01-01', '2026-12-31'
    )
    expect(result).toHaveLength(3)
    expect(result.at(-1).date).toBe('2026-03-15')
  })

  it('respeita exclusão em recorrente', () => {
    const result = expandOccurrences(
      tx({ frequencia: 'mensal', dataInicio: '2026-01-15', exclusoes: ['2026-02-15'] }),
      '2026-01-01', '2026-03-31'
    )
    const dates = result.map(r => r.date)
    expect(dates).not.toContain('2026-02-15')
    expect(result).toHaveLength(2)
  })
})

// ── expandOccurrences — parcelado ────────────────────────────────────────────
describe('expandOccurrences — parcelado', () => {
  it('gera número correto de parcelas', () => {
    const result = expandOccurrences(
      tx({ frequencia: 'parcelado', dataInicio: '2026-01-01', parcelaAtual: 1, totalParcelas: 6 }),
      '2026-01-01', '2026-12-31'
    )
    expect(result).toHaveLength(6)
  })

  it('gera apenas parcelas restantes quando parcelaAtual > 1', () => {
    const result = expandOccurrences(
      tx({ frequencia: 'parcelado', dataInicio: '2026-04-01', parcelaAtual: 4, totalParcelas: 6 }),
      '2026-04-01', '2026-12-31'
    )
    expect(result).toHaveLength(3) // parcelas 4, 5, 6
  })

  it('não gera ocorrências além do to', () => {
    const result = expandOccurrences(
      tx({ frequencia: 'parcelado', dataInicio: '2026-01-01', parcelaAtual: 1, totalParcelas: 6 }),
      '2026-01-01', '2026-03-31'
    )
    expect(result).toHaveLength(3) // jan, fev, mar
  })
})

// ── expandOccurrences — semanal ──────────────────────────────────────────────
describe('expandOccurrences — semanal', () => {
  it('gera 4 ocorrências em ~4 semanas', () => {
    const result = expandOccurrences(
      tx({ frequencia: 'semanal', dataInicio: '2026-06-01' }),
      '2026-06-01', '2026-06-28'
    )
    // 1, 8, 15, 22 = 4 ocorrências
    expect(result).toHaveLength(4)
  })
})

// ── calcSaldo ────────────────────────────────────────────────────────────────
describe('calcSaldo', () => {
  it('retorna 0 para lista vazia', () => {
    expect(calcSaldo([], '2026-06-01', '2026-06-30')).toBe(0)
  })

  it('soma entradas como positivo', () => {
    const result = calcSaldo(
      [entrada({ valor: 500 })],
      '2026-06-01', '2026-06-30'
    )
    expect(result).toBe(500)
  })

  it('soma saídas como negativo', () => {
    const result = calcSaldo(
      [tx({ valor: 200 })],
      '2026-06-01', '2026-06-30'
    )
    expect(result).toBe(-200)
  })

  it('resultado líquido correto com entrada e saída', () => {
    const result = calcSaldo(
      [entrada({ valor: 1000 }), tx({ valor: 300, dataInicio: '2026-06-20' })],
      '2026-06-01', '2026-06-30'
    )
    expect(result).toBe(700)
  })

  it('ignora transações fora do range', () => {
    const result = calcSaldo(
      [tx({ valor: 500, dataInicio: '2026-05-01' })],
      '2026-06-01', '2026-06-30'
    )
    expect(result).toBe(0)
  })
})

// ── buildDailyProjection ─────────────────────────────────────────────────────
describe('buildDailyProjection', () => {
  it('retorna um dia por dia no range', () => {
    const days = buildDailyProjection([], '2026-06-01', '2026-06-05', 0)
    expect(days).toHaveLength(5)
    expect(days[0].date).toBe('2026-06-01')
    expect(days[4].date).toBe('2026-06-05')
  })

  it('saldo acumulado correto', () => {
    const txList = [
      entrada({ valor: 1000, dataInicio: '2026-06-01' }),
      tx({ valor: 300, dataInicio: '2026-06-03' }),
    ]
    const days = buildDailyProjection(txList, '2026-06-01', '2026-06-05', 0)
    expect(days[0].saldo).toBe(1000)  // após entrada
    expect(days[2].saldo).toBe(700)   // após saída de 300
    expect(days[4].saldo).toBe(700)   // sem movimentação
  })

  it('parte do saldo inicial', () => {
    const days = buildDailyProjection([], '2026-06-01', '2026-06-03', 500)
    expect(days[0].saldo).toBe(500)
    expect(days[2].saldo).toBe(500)
  })
})

// ── getProximoVencimento ─────────────────────────────────────────────────────
describe('getProximoVencimento', () => {
  // card com diaFech=20, diaVenc=25: hoje=17 < fech=20 → vence no mês corrente (Jun/25)
  it('retorna vencimento do mês corrente quando hoje < diaFechamento', () => {
    const card = { diaFechamento: 20, diaVencimento: 25 }
    expect(getProximoVencimento(card, '2026-06-17')).toBe('2026-06-25')
  })

  // hoje=21 > fech=20 → ciclo passou, vence mês seguinte (Jul/25)
  it('retorna vencimento do próximo mês quando hoje > diaFechamento', () => {
    const card = { diaFechamento: 20, diaVencimento: 25 }
    expect(getProximoVencimento(card, '2026-06-21')).toBe('2026-07-25')
  })

  // diaVenc=1, diaFech=15: fechou em Jun/15 mas vence Jul/1
  // hoje=10 < fech=15 → mes=Jun; diaVenc(1) < diaFech(15) → +1 mês → Jul/1
  it('adiciona mês extra quando diaVencimento < diaFechamento (venc no mês seguinte ao fechamento)', () => {
    const card = { diaFechamento: 15, diaVencimento: 1 }
    expect(getProximoVencimento(card, '2026-06-10')).toBe('2026-07-01')
  })

  // hoje=16 > fech=15 → +1; diaVenc(1) < diaFech(15) → +1 → Ago/1
  it('combina ambos os avanços quando hoje > fech e diaVenc < diaFech', () => {
    const card = { diaFechamento: 15, diaVencimento: 1 }
    expect(getProximoVencimento(card, '2026-06-16')).toBe('2026-08-01')
  })

  // diaVenc=31 em mês com 30 dias → clampado para 30
  it('clampeia diaVencimento ao último dia do mês', () => {
    const card = { diaFechamento: 20, diaVencimento: 31 }
    expect(getProximoVencimento(card, '2026-05-15')).toBe('2026-05-31')
    expect(getProximoVencimento(card, '2026-05-21')).toBe('2026-06-30') // jun tem 30 dias
  })

  // cartão sem diaFechamento: usa diaVencimento como fechamento
  it('usa diaVencimento como fechamento quando diaFechamento não definido', () => {
    const card = { diaVencimento: 10 }
    expect(getProximoVencimento(card, '2026-06-05')).toBe('2026-06-10')
    expect(getProximoVencimento(card, '2026-06-11')).toBe('2026-07-10')
  })
})

// ── getClosingDate ────────────────────────────────────────────────────────────
describe('getClosingDate', () => {
  it('fechamento no mesmo mês quando diaVenc >= diaFech', () => {
    const card = { diaFechamento: 20, diaVencimento: 25 }
    expect(getClosingDate(card, '2026-07-25')).toBe('2026-07-20')
  })

  it('fechamento no mês anterior quando diaVenc < diaFech', () => {
    const card = { diaFechamento: 15, diaVencimento: 1 }
    expect(getClosingDate(card, '2026-07-01')).toBe('2026-06-15')
  })

  it('clampeia diaFechamento ao último dia do mês', () => {
    const card = { diaFechamento: 31, diaVencimento: 5 }
    // venc=Fev/05 → fecha em Jan (diaVenc < diaFech) → Jan/31
    expect(getClosingDate(card, '2026-02-05')).toBe('2026-01-31')
    // venc=Jun/05 → fecha em Mai → Mai/31
    expect(getClosingDate(card, '2026-06-05')).toBe('2026-05-31')
  })

  it('atravessa virada de ano corretamente', () => {
    const card = { diaFechamento: 15, diaVencimento: 1 }
    expect(getClosingDate(card, '2026-01-01')).toBe('2025-12-15')
  })
})

// ── calcFaturaCard ────────────────────────────────────────────────────────────
describe('calcFaturaCard', () => {
  const card = { id: 'c1', diaFechamento: 20, diaVencimento: 25, limite: 5000 }

  // Hoje=2026-06-17 → getProximoVencimento → 2026-06-25, prevVenc=2026-05-25
  const makeTx = (dataInicio, valor = 100, extra = {}) => ({
    id: `tx-${dataInicio}`,
    tipo: 'cartao',
    cartaoId: 'c1',
    frequencia: 'unico',
    dataInicio,
    valor,
    conferido: false,
    ...extra,
  })

  it('inclui na faturaAtual lançamento com dataInicio = proximoVenc', () => {
    const { faturaAtual } = calcFaturaCard(card, [makeTx('2026-06-25')], '2026-06-17')
    expect(faturaAtual).toBe(100)
  })

  it('inclui na faturaAtual lançamento no intervalo (prevVenc, proximoVenc]', () => {
    const { faturaAtual } = calcFaturaCard(card, [makeTx('2026-06-01')], '2026-06-17')
    expect(faturaAtual).toBe(100)
  })

  it('NÃO inclui lançamento exatamente em prevVenc (limite exclusivo)', () => {
    const { faturaAtual } = calcFaturaCard(card, [makeTx('2026-05-25')], '2026-06-17')
    expect(faturaAtual).toBe(0)
  })

  it('envia para comprometidoFuturo lançamento > proximoVenc', () => {
    const { comprometidoFuturo } = calcFaturaCard(card, [makeTx('2026-07-25')], '2026-06-17')
    expect(comprometidoFuturo).toBe(100)
  })

  it('ignora lançamentos conferidos', () => {
    const { faturaAtual } = calcFaturaCard(card, [makeTx('2026-06-25', 100, { conferido: true })], '2026-06-17')
    expect(faturaAtual).toBe(0)
  })

  it('ignora lançamentos de outro cartão', () => {
    const { faturaAtual } = calcFaturaCard(card, [makeTx('2026-06-25', 100, { cartaoId: 'outro' })], '2026-06-17')
    expect(faturaAtual).toBe(0)
  })

  it('calcula limiteDisponivel corretamente', () => {
    const txs = [makeTx('2026-06-25', 1000), makeTx('2026-07-25', 500)]
    const { limiteDisponivel } = calcFaturaCard(card, txs, '2026-06-17')
    // limite 5000 - faturaAtual 1000 - comprometido 500 = 3500
    expect(limiteDisponivel).toBe(3500)
  })

  it('acumula parcelas futuras de itens parcelados em comprometidoFuturo', () => {
    const txComItens = makeTx('2026-06-25', 200, {
      itens: [{
        descricao: 'Compra parcelada',
        valor: 200,
        isParcelado: true,
        parcelaAtual: 1,
        totalParcelas: 3,
      }],
    })
    const { comprometidoFuturo } = calcFaturaCard(card, [txComItens], '2026-06-17')
    // 2 parcelas restantes × 200 = 400
    expect(comprometidoFuturo).toBe(400)
  })

  it('soma múltiplos lançamentos na fatura atual', () => {
    const txs = [makeTx('2026-06-10', 300), makeTx('2026-06-25', 200)]
    const { faturaAtual } = calcFaturaCard(card, txs, '2026-06-17')
    expect(faturaAtual).toBe(500)
  })
})

// ── calcularSobraSegura ──────────────────────────────────────────────────────
describe('calcularSobraSegura', () => {
  it('retorna 0 quando projeção fica negativa', () => {
    const txList = [tx({ valor: 99999, dataInicio: '2026-06-20' })]
    const { sobra } = calcularSobraSegura(txList, [])
    expect(sobra).toBe(0)
  })

  it('retorna saldo mínimo projetado quando positivo', () => {
    // Entrada de 1000 hoje (histórica) + sem gastos futuros + saldo inicial de 500
    const wallets = [{ saldoInicial: 500 }]
    const txList = [entrada({ valor: 1000, dataInicio: '2026-06-17' })]
    const { sobra } = calcularSobraSegura(txList, wallets)
    // Saldo histórico: saldo inicial (500) + entradas passadas (0, pois "hoje" está no futuro)
    // O mínimo deve ser >= 0
    expect(sobra).toBeGreaterThanOrEqual(0)
  })

  it('retorna dataVerificada 45 dias à frente', () => {
    const { dataVerificada } = calcularSobraSegura([], [])
    // 2026-06-17 + 45 dias = 2026-08-01
    expect(dataVerificada).toBe('2026-08-01')
  })
})
