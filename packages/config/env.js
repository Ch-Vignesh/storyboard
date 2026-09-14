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
