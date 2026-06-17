import { describe, it, expect } from 'vitest'
import {
  formatBRL,
  addMonths,
  addDays,
  addWeeks,
  startOfMonth,
  endOfMonth,
  formatDate,
  parseBRLInput,
  numberToBRLInput,
} from '../formatters'

describe('formatBRL', () => {
  it('formata zero', () => {
    expect(formatBRL(0)).toBe('R$ 0,00')
  })

  it('formata valor positivo', () => {
    expect(formatBRL(1500.5)).toBe('R$ 1.500,50')
  })

  it('formata valor negativo', () => {
    expect(formatBRL(-200)).toBe('-R$ 200,00')
  })

  it('formata centavos', () => {
    expect(formatBRL(0.99)).toBe('R$ 0,99')
  })
})

describe('addMonths', () => {
  it('avança 1 mês normalmente', () => {
    expect(addMonths('2026-01-15', 1)).toBe('2026-02-15')
  })

  it('clamp dia 31 em fevereiro', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
  })

  it('recupera dia 31 em março após passar por fevereiro', () => {
    // De jan 31, +2 meses = mar 31 (não mar 28)
    expect(addMonths('2026-01-31', 2)).toBe('2026-03-31')
  })

  it('avança ano corretamente de dezembro', () => {
    expect(addMonths('2025-12-01', 1)).toBe('2026-01-01')
  })

  it('avança múltiplos meses cruzando ano', () => {
    expect(addMonths('2025-11-30', 3)).toBe('2026-02-28')
  })

  it('dia 29 em fevereiro de ano não-bissexto', () => {
    expect(addMonths('2026-01-29', 1)).toBe('2026-02-28')
  })

  it('dia 29 em fevereiro de ano bissexto permanece', () => {
    expect(addMonths('2024-01-29', 1)).toBe('2024-02-29')
  })

  it('subtrai meses com n negativo', () => {
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28')
  })
})

describe('addDays', () => {
  it('avança 1 dia', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
  })

  it('avança 0 dias retorna mesma data', () => {
    expect(addDays('2026-06-17', 0)).toBe('2026-06-17')
  })

  it('avança 365 dias', () => {
    expect(addDays('2025-06-17', 365)).toBe('2026-06-17')
  })

  it('subtrai dias com n negativo', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('addWeeks', () => {
  it('avança 1 semana = 7 dias', () => {
    expect(addWeeks('2026-06-01', 1)).toBe('2026-06-08')
  })

  it('avança 4 semanas', () => {
    expect(addWeeks('2026-01-01', 4)).toBe('2026-01-29')
  })
})

describe('startOfMonth / endOfMonth', () => {
  it('startOfMonth retorna dia 01', () => {
    expect(startOfMonth('2026-06-17')).toBe('2026-06-01')
  })

  it('endOfMonth em junho retorna 30', () => {
    expect(endOfMonth('2026-06-17')).toBe('2026-06-30')
  })

  it('endOfMonth em janeiro retorna 31', () => {
    expect(endOfMonth('2026-01-15')).toBe('2026-01-31')
  })

  it('endOfMonth em fevereiro não-bissexto retorna 28', () => {
    expect(endOfMonth('2026-02-01')).toBe('2026-02-28')
  })

  it('endOfMonth em fevereiro bissexto retorna 29', () => {
    expect(endOfMonth('2024-02-01')).toBe('2024-02-29')
  })
})

describe('formatDate', () => {
  it('converte YYYY-MM-DD para DD/MM/YYYY', () => {
    expect(formatDate('2026-06-17')).toBe('17/06/2026')
  })

  it('retorna vazio para string vazia', () => {
    expect(formatDate('')).toBe('')
  })
})

describe('parseBRLInput', () => {
  it('parse string formatada', () => {
    expect(parseBRLInput('1.500,50')).toBe(1500.5)
  })

  it('parse inteiro sem centavos', () => {
    expect(parseBRLInput('1.500')).toBe(1500)
  })

  it('retorna 0 para vazio', () => {
    expect(parseBRLInput('')).toBe(0)
  })
})

describe('numberToBRLInput', () => {
  it('converte número para formato de input', () => {
    expect(numberToBRLInput(1500.5)).toBe('1.500,50')
  })

  it('retorna vazio para zero', () => {
    expect(numberToBRLInput(0)).toBe('')
  })

  it('centavos com zero à esquerda', () => {
    expect(numberToBRLInput(1.05)).toBe('1,05')
  })
})
