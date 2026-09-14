import { loadRootEnv } from '@storyboard/config/env'
import { defineConfig, devices } from '@playwright/test'

loadRootEnv()

/**
 * The critical flows (architecture section 8). Phase 1 covers flows 1 and 2;
 * the remaining four arrive with the contribution loop in phase 2.
 *
 * These run against a real server and a real database — that is the point of
 * them, and why they are separate from the Vitest suites. `webServer` builds
 * and starts the application unless one is already running, so `pnpm e2e`
 * works from a clean checkout and in CI without a second command.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100)
// One host throughout. Auth.js sets the session cookie on the host that served
// the page, so mixing 127.0.0.1 and localhost silently loses the session.
const baseURL = `http://localhost:${String(PORT)}`

export default defineConfig({
  testDir: './e2e',
  // Flows share one database; running them at once would make the sign-up
  // counts and the dashboard contents race each other.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm build && pnpm start --port ${String(PORT)}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      // The console mailer prints the verification link to stdout, which is how
      // the sign-up flow gets its token without a mail server (decision 0002).
      RESEND_API_KEY: '',
      NEXT_PUBLIC_APP_URL: baseURL,
      AUTH_URL: baseURL,
      AUTH_TRUST_HOST: 'true',
    },
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
