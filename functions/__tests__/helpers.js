// Carrega o bot (CommonJS) dentro do vitest. VITEST=true faz o index.js expor __test.
import { createRequire } from 'node:module'
import { vi, beforeEach, afterEach } from 'vitest'

const require = createRequire(import.meta.url)
process.env.VITEST = 'true'
export const bot = require('../index.js').__test

// 14/10/2026 12:00 em Brasília (15:00 UTC) — o bot e o app usam o relógio em vários pontos
export const HOJE = '2026-10-14'
export function fixarRelogio(iso = '2026-10-14T15:00:00Z') {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(iso)) })
  afterEach(() => { vi.useRealTimers() })
}
