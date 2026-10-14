import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Os testes de paridade rodam centenas de cenários; sob a carga da suíte inteira o padrão de 5 s estourava
    testTimeout: 30000,
  },
})
