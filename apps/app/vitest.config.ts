// Decision 0006: the one root .env, loaded before anything validates it. The
// digest tests import `@/env`, which fails the whole suite on a missing value.
import { loadRootEnv } from '@storyboard/config/env'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

loadRootEnv()

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // See test/server-only.ts: the guard stays in the build, not the tests.
      'server-only': fileURLToPath(new URL('./test/server-only.ts', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
  },
})
