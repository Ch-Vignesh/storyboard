// Decision 0006: the one root .env, loaded before anything validates it.
import { keepTestsOffHostedDatabases, loadRootEnv } from '@storyboard/config/env'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

loadRootEnv()
keepTestsOffHostedDatabases()

// Tests never send real mail. Every suite that sends passes its own mailer, and
// this makes sure one that forgets reaches the console, not somebody's inbox.
for (const name of ['RESEND_API_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD']) {
  process.env[name] = ''
}

// Four database suites import `@/env` on their way to the code they test. With
// no database for this run they skip themselves — but only if that import does
// not throw first on the missing DATABASE_URL, and it would.
if (!process.env.DATABASE_URL) process.env.SKIP_ENV_VALIDATION = '1'

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
