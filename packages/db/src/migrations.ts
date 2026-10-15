import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { PrismaClient } from './generated/prisma/client'

/** Where this package's migrations live. */
export const MIGRATIONS_DIR = fileURLToPath(new URL('../prisma/migrations', import.meta.url))

/** The migrations this code ships with, oldest first. `migration_lock.toml` is not one. */
export function shippedMigrations(dir: string = MIGRATIONS_DIR): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(dir, entry.name, 'migration.sql')))
    .map((entry) => entry.name)
    .sort()
}

/**
 * The migrations Prisma finished on this database and did not roll back. A
 * database no migration has touched has no `_prisma_migrations` table at all,
 * which is every migration missing rather than an error.
 */
export async function appliedMigrations(db: PrismaClient): Promise<string[]> {
  const [table] = await db.$queryRaw<Array<{ name: string | null }>>`
    SELECT to_regclass('_prisma_migrations')::text AS name`
  if (!table?.name) return []
  const rows = await db.$queryRaw<Array<{ migration_name: string }>>`
    SELECT migration_name FROM _prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`
  return rows.map((row) => row.migration_name)
}

/**
 * Shipped but not applied, in the order they would run. One applied but not
 * shipped is not a problem: migrations are additive, so the code before a
 * migration runs against the schema after it.
 */
export function pendingMigrations(
  shipped: readonly string[],
  applied: readonly string[],
): string[] {
  const done = new Set(applied)
  return shipped.filter((name) => !done.has(name))
}
