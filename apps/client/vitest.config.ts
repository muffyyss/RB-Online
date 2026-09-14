import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: '@rb/client',
    // Only the main-process logic is tested here, and it runs in plain Node:
    // everything that touches Electron is injected, so no Electron is needed.
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
