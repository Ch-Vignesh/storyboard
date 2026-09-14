import { loadRootEnv } from '@storyboard/config/env'
import { defineConfig } from 'prisma/config'

loadRootEnv()

// `prisma generate` runs on every install and must work on a fresh clone with
// no `.env`. Only commands that talk to a database need the URL.
const offlineCommands = new Set(['generate', 'validate', 'format', 'diff'])
const needsDatabase = !process.argv.some((arg) => offlineCommands.has(arg))
const databaseUrl = process.env.DATABASE_URL

if (needsDatabase && !databaseUrl) {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to .env at the repository root, ' +
      'start Postgres with `docker compose up -d`, then try again.',
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
