import { loadRootEnv } from '@storyboard/config/env'
import { defineConfig } from 'prisma/config'

loadRootEnv()

// `prisma generate` runs on every install and must work on a fresh clone with
// no `.env`. Only commands that talk to a database need the URL.
const offlineCommands = new Set(['generate', 'validate', 'format', 'diff'])
const needsDatabase = !process.argv.some((arg) => offlineCommands.has(arg))

/**
 * This file configures the Prisma CLI, and the CLI only ever issues DDL:
 * migrate, reset, studio. That is the one workload a transaction-mode
 * connection pooler cannot carry — Neon, Supabase and PgBouncer all hand out
 * pooled connections on which advisory locks and multi-statement DDL either
 * fail or, worse, half-apply. The application wants the pooled URL, so the two
 * are separate variables rather than one.
 *
 * `DIRECT_DATABASE_URL` is optional: with a single unpooled database, which is
 * how this runs locally, `DATABASE_URL` is both.
 */
const databaseUrl = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL

if (needsDatabase && !databaseUrl) {
  throw new Error(
    'Neither DIRECT_DATABASE_URL nor DATABASE_URL is set. Copy .env.example to .env at the ' +
      'repository root, start Postgres with `docker compose up -d`, then try again.',
  )
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed/index.ts',
  },
  datasource: {
    url: databaseUrl ?? '',
  },
})
