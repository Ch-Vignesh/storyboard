import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'

/**
 * Load the single `.env` at the repository root into `process.env`.
 *
 * Every app and package reads the same file so a contributor configures the
 * project once. Missing file is not an error: hosted environments inject
 * variables directly. Existing variables are never overwritten.
 *
 * @returns {string} absolute path of the file that was looked for
 */
export function loadRootEnv() {
  const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
  const file = resolve(repoRoot, '.env')
  if (existsSync(file)) config({ path: file, quiet: true })
  return file
}

// `URL` keeps the brackets on an IPv6 host.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * The host a connection string points at, or `undefined` if it does not parse.
 *
 * @param {string} url
 * @returns {string | undefined}
 */
export function databaseHost(url) {
  try {
    return new URL(url).hostname
  } catch {
    return undefined
  }
}

/**
 * Whether a connection string names a database on this machine. One that does
 * not parse is not local: everything that asks is about to refuse something.
 *
 * @param {string} url
 * @returns {boolean}
 */
export function isLocalDatabase(url) {
  const host = databaseHost(url)
  return host !== undefined && LOCAL_HOSTS.has(host)
}

/**
 * Keep a test run off any database that is not on this machine.
 *
 * The database tests write real rows — accounts, storyboards, reports — and two
 * of them run the purge. With the deployed database in `.env`, a routine
 * `pnpm test` would do all of that to production. So for a test run a hosted
 * `DATABASE_URL` counts as unset, and the suites that need a database skip
 * themselves exactly as they do on a clone with no `.env`. To run them, name a
 * local database for that one command:
 *
 *   DATABASE_URL=postgresql://storyboard:storyboard@localhost:5432/storyboard pnpm test
 *
 * CI sets a local `DATABASE_URL`, so nothing there changes.
 */
export function keepTestsOffHostedDatabases() {
  const url = process.env.DATABASE_URL
  if (!url || isLocalDatabase(url)) return
  console.warn(
    `Database tests skipped: DATABASE_URL points at ${databaseHost(url) ?? 'a URL that does not parse'}, ` +
      'not this machine. Set DATABASE_URL to a local database for the command to run them.',
  )
  // Emptied, not deleted: dotenv never overwrites a variable that exists, so a
  // later loadRootEnv() cannot bring the hosted URL back.
  process.env.DATABASE_URL = ''
  process.env.DIRECT_DATABASE_URL = ''
}
