/**
 * Refuses a build whose database is missing a migration this code needs.
 *
 * Nothing applies migrations on a deploy (docs/05-deployment.md): the order is
 * `pnpm db:deploy`, then push. On 2026-10-15 the push went first, and the
 * password reset met a production database without `User.passwordChangedAt`.
 * Every sign-in, every sign-up and every signed-in page failed until the
 * migration was applied. A rule written in a document did not stop it.
 *
 * The build already reads the database, because the sitemap is prerendered
 * from it, so the build is where to stop it. turbo.json runs this before
 * `@storyboard/app` builds. A Vercel build that fails here is never promoted,
 * and the deployment already live keeps serving.
 *
 * Without DATABASE_URL there is nothing to compare against, and it says so.
 */
import { loadRootEnv } from '@storyboard/config/env'

import { createPrismaClient } from '../src/client'
import { appliedMigrations, pendingMigrations, shippedMigrations } from '../src/migrations'

loadRootEnv()

if (!process.env.DATABASE_URL) {
  console.warn('Migration check skipped: DATABASE_URL is not set.')
} else {
  const db = createPrismaClient({ log: [] })
  try {
    const shipped = shippedMigrations()
    const pending = pendingMigrations(shipped, await appliedMigrations(db))
    if (pending.length > 0) {
      console.error(
        [
          `The database is missing ${String(pending.length)} migration(s) this code needs:`,
          ...pending.map((name) => `  - ${name}`),
          '',
          'Apply them first, from a machine with DIRECT_DATABASE_URL set:',
          '  pnpm db:deploy',
          'then build again. Until then the deployment already live keeps serving.',
        ].join('\n'),
      )
      process.exitCode = 1
    } else {
      console.warn(`Migrations: all ${String(shipped.length)} applied.`)
    }
  } finally {
    await db.$disconnect()
  }
}
