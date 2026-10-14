import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

/**
 * Carrega o index.js num Node limpo, com o firebase-admin/firebase-functions REAIS (sem o fake do Firestore),
 * como o `firebase deploy` faz para descobrir as functions. Pegaria, por exemplo, uma API removida numa
 * atualização de dependência — coisa que os testes com Firestore simulado não enxergam.
 */
describe('carga do módulo das functions (como no deploy)', () => {
  it('carrega sem erro e exporta as 5 functions', () => {
    const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
    const saida = execFileSync(process.execPath, [
      '-e', "const m = require('./index.js'); console.log(JSON.stringify(Object.keys(m).sort())); process.exit(0)",
    ], { cwd: dir, env: { ...process.env, VITEST: '', GCLOUD_PROJECT: 'matobafinancas' }, encoding: 'utf8' })
    const exportadas = JSON.parse(saida.trim().split('\n').pop())
    expect(exportadas).toEqual(['dailyNotifications', 'sendTestPush', 'setTelegramWebhook', 'smsWebhook', 'telegramWebhook'])
  })
})
