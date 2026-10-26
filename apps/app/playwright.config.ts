import { databaseHost, isLocalDatabase, loadRootEnv } from '@storyboard/config/env'
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
const localURL = `http://localhost:${String(PORT)}`

/**
 * Against a deployment rather than a build of this working tree.
 *
 * With `PLAYWRIGHT_BASE_URL` set, nothing is built and no server is started,
 * and only the tests tagged `@deployed` run: the ones that visit pages and
 * write nothing. The rest cannot work against a deployment and must not try.
 * They read the verification email from `MAIL_LOG_FILE`, which a deployed
 * server never writes, so every sign-up would send a real email to an
 * undeliverable address and then fail; and some write to `DATABASE_URL`
 * directly, which on a laptop whose `.env` names production is production.
 * Tagging a test `@deployed` is a claim that it does neither.
 */
const deployed = process.env.PLAYWRIGHT_BASE_URL
const baseURL = deployed ?? localURL

// Against a deployment, nothing in these tests may reach a database: `.env`
// names production. Blank rather than deleted, so a later `loadRootEnv` cannot
// fill it again, and a file that writes directly fails instead of writing. On
// 2026-10-26 the phone project ran the margin spec's setup against production.
if (deployed) {
  process.env.DATABASE_URL = ''
  process.env.DIRECT_DATABASE_URL = ''
}

// Built from this working tree, the server writes to whatever DATABASE_URL
// names, and two flows write to it directly as well. Once `.env` holds the
// deployed database, that is production — so a local run needs a local one.
const databaseUrl = process.env.DATABASE_URL
if (!deployed && databaseUrl && !isLocalDatabase(databaseUrl)) {
  throw new Error(
    `DATABASE_URL points at ${databaseHost(databaseUrl) ?? 'a URL that does not parse'}, not this ` +
      'machine. The flows sign up accounts and write storyboards, so run them against a local ' +
      'database: DATABASE_URL=postgresql://storyboard:storyboard@localhost:5432/storyboard pnpm e2e. ' +
      'To run them against a deployment on purpose, set PLAYWRIGHT_BASE_URL.',
  )
}

export default defineConfig({
  testDir: './e2e',
  grep: deployed ? /@deployed/u : undefined,
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
  /**
   * Phase 14, item 4.9 — two projects: the desktop one runs everything not
   * tagged `@mobile`; the phone one runs only what is. `pnpm e2e` runs both,
   * here and in CI.
   *
   * A project's own `grep` replaces the one above, so against a deployment the
   * phone project asks for `@deployed` itself. It did not, and on 2026-10-26
   * it signed up on production and wrote the margin spec's story there.
   */
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, grepInvert: /@mobile/u },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      grep: deployed ? /^(?=.*@mobile)(?=.*@deployed)/su : /@mobile/u,
    },
  ],
  webServer: deployed
    ? undefined
    : {
        command: `pnpm build && pnpm start --port ${String(PORT)}`,
        url: localURL,
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
        env: {
          // The console mailer prints the verification link to stdout, which is how
          // the sign-up flow gets its token without a mail server (decision 0002).
          // Every provider is blanked, or a real one in .env would send instead.
          RESEND_API_KEY: '',
          SMTP_HOST: '',
          SMTP_USER: '',
          SMTP_PASSWORD: '',
          // The same for the bucket: with R2 in .env, flow 7 would upload its
          // manuscript to the production bucket, from an origin its CORS rule
          // does not allow. Blank, uploads go to .uploads/ on this server.
          R2_ACCOUNT_ID: '',
          R2_ACCESS_KEY_ID: '',
          R2_SECRET_ACCESS_KEY: '',
          R2_BUCKET: '',
          NEXT_PUBLIC_APP_URL: localURL,
          AUTH_URL: localURL,
          AUTH_TRUST_HOST: 'true',
        },
        stdout: 'pipe',
        stderr: 'pipe',
      },
})
