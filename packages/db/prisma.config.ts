import { databaseHost, isLocalDatabase, loadRootEnv } from '@storyboard/config/env'
import { defineConfig } from 'prisma/config'

loadRootEnv()

// `prisma generate` runs on every install and must work on a fresh clone with
// no `.env`. Only commands that talk to a database need the URL.
const offlineCommands = new Set(['generate', 'validate', 'format', 'diff'])
const needsDatabase = !process.argv.some((arg) => offlineCommands.has(arg))

/**
 * This file configures the Prisma CLI, and the CLI only ever issues DDL:
 * migrate, reset, studio. That is the one workload a transaction-mode
 * connection pooler cannot carry — Prisma Postgres, Neon and PgBouncer all hand
 * out pooled connections on which advisory locks and multi-statement DDL either
 * fail or, worse, half-apply. The application wants the pooled URL, so the two
 * are separate variables rather than one.
 *
 * `DIRECT_DATABASE_URL` is optional: with a single unpooled database, which is
 * how this runs locally, `DATABASE_URL` is both. Empty means unset, as it does
 * in the application's env schema — `.env.example` ships it as `""`.
 *
 * A local `DATABASE_URL` wins outright. A database on this machine has no
 * pooler to route around, and naming one for a single command
 * (`DATABASE_URL=… pnpm db:migrate`) has to mean that database — not the hosted
 * direct URL still sitting in `.env`.
 */
const unlessEmpty = (value: string | undefined) => (value === '' ? undefined : value)
const pooledUrl = unlessEmpty(process.env.DATABASE_URL)
const directUrl = unlessEmpty(process.env.DIRECT_DATABASE_URL)
const databaseUrl = pooledUrl && isLocalDatabase(pooledUrl) ? pooledUrl : (directUrl ?? pooledUrl)

if (needsDatabase && !databaseUrl) {
  throw new Error(
    'Neither DIRECT_DATABASE_URL nor DATABASE_URL is set. Copy .env.example to .env at the ' +
      'repository root, start Postgres with `docker compose up -d`, then try again.',
  )
}

/**
 * `migrate dev` and `migrate reset` are for authoring migrations, and both will
 * drop every table — `migrate dev` offers to whenever the database has drifted
 * from the migration history, which is one keystroke from gone. `db push` is
 * banned outright (it skips the invariant SQL), and does the most damage here.
 * A hosted database gets `pnpm db:deploy`, which only ever applies.
 */
const args = new Set(process.argv)
const developmentOnly =
  (args.has('migrate') && (args.has('dev') || args.has('reset'))) ||
  (args.has('db') && args.has('push'))

if (
  developmentOnly &&
  databaseUrl &&
  !isLocalDatabase(databaseUrl) &&
  process.env.ALLOW_REMOTE_SCHEMA_RESET !== 'yes-really'
) {
  throw new Error(
    `Refusing to run this against ${databaseHost(databaseUrl) ?? 'a URL that does not parse'}: it can ` +
      'drop every table. To apply migrations to a hosted database, run `pnpm db:deploy`. To author ' +
      'one, point DATABASE_URL at a local database for the command. If this really is a disposable ' +
      'development database, set ALLOW_REMOTE_SCHEMA_RESET=yes-really.',
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
