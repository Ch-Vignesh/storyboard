/**
 * The one administrator (decision 0043), set from the command line and never
 * from the interface:
 *
 *   pnpm admin:grant <email>                 against the local database
 *   pnpm admin:grant <email> --production    against the hosted one
 *
 * Promotes the account at the address and demotes whoever held the role. It
 * refuses a database that is not on this machine unless told `--production`,
 * so the root `.env`, which names the live database, cannot be reached by a
 * slip. It uses the direct URL where there is one, as migrations do.
 */
import { isLocalDatabase, loadRootEnv } from '@storyboard/config/env'

import { grantAdmin } from '../src/admin'
import { createPrismaClient } from '../src/client'

loadRootEnv()

function fail(message: string): never {
  console.error(message)
  process.exit(2)
}

async function main(): Promise<void> {
  const [email, flag] = process.argv.slice(2)
  if (!email?.includes('@')) fail('Usage: pnpm admin:grant <email> [--production]')

  // The same rule as `prisma.config.ts`: empty means unset, a local pooled URL
  // wins outright, otherwise the direct URL where there is one.
  const unlessEmpty = (value: string | undefined) => (value === '' ? undefined : value)
  const pooled = unlessEmpty(process.env.DATABASE_URL)
  const direct = unlessEmpty(process.env.DIRECT_DATABASE_URL)
  const connectionString = pooled && isLocalDatabase(pooled) ? pooled : (direct ?? pooled)
  if (!connectionString) fail('DATABASE_URL is not set.')
  if (!isLocalDatabase(connectionString) && flag !== '--production') {
    fail(
      'That database is not on this machine. Pass --production to change the administrator there.',
    )
  }

  const db = createPrismaClient({ connectionString, log: [] })
  try {
    const result = await grantAdmin(db, email)
    const demoted = result.demoted.length > 0 ? ` Demoted: ${result.demoted.join(', ')}.` : ''
    console.warn(`${email} is now the administrator.${demoted}`)
  } finally {
    await db.$disconnect()
  }
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error))
})
