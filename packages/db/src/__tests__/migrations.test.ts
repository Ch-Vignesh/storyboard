/**
 * The build's migration check (scripts/check-migrations.ts). On 2026-10-15
 * code went live before its migration and every sign-in failed; this is what
 * makes the build refuse instead.
 *
 * The last test needs a real Postgres with migrations applied, so it skips
 * when DATABASE_URL is unset. CI runs it after `pnpm db:deploy`.
 */
import { describe, expect, it } from 'vitest'

import { createPrismaClient } from '../client'
import { appliedMigrations, pendingMigrations, shippedMigrations } from '../migrations'

describe('pendingMigrations', () => {
  it('names what is shipped and not applied, in the order it would run', () => {
    expect(pendingMigrations(['a_first', 'b_second', 'c_third'], ['a_first'])).toEqual([
      'b_second',
      'c_third',
    ])
  })

  it('does not mind a database ahead of the code', () => {
    expect(pendingMigrations(['a_first'], ['a_first', 'b_later'])).toEqual([])
  })
})

describe('shippedMigrations', () => {
  it('reads the real folder, oldest first, and only the migrations in it', () => {
    const shipped = shippedMigrations()

    expect(shipped[0]).toBe('20260912000000_init')
    expect(shipped).toContain('20261014223653_password_reset')
    expect(shipped).toEqual([...shipped].sort())
    expect(shipped).not.toContain('migration_lock.toml')
  })
})

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('appliedMigrations', () => {
  it('finds every shipped migration on a migrated database', async () => {
    const db = createPrismaClient({ log: [] })
    try {
      expect(pendingMigrations(shippedMigrations(), await appliedMigrations(db))).toEqual([])
    } finally {
      await db.$disconnect()
    }
  })
})
