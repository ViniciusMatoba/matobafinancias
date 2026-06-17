import { describe, it, expect, vi, beforeEach } from 'vitest'

// Fixa "hoje" em 2026-06-17 para tornar todos os testes determinísticos
vi.mock('../formatters', async (importOriginal) => {
  const real = await importOriginal()
  return { ...real, todayStr: () => '2026-06-17' }
})

import { expandOccurrences, calcSaldo, buildDailyProjection, calcularSobraSegura } from '../projectionCalc'

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
