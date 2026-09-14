import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from './generated/prisma/client'

type CreateOptions = {
  /** Defaults to process.env.DATABASE_URL. */
  connectionString?: string
  /** Prisma log levels. Defaults to warnings and errors. */
  log?: Array<'query' | 'info' | 'warn' | 'error'>
}

/**
 * Build a Prisma client backed by node-postgres. Prisma 7 talks to Postgres
 * through a driver adapter, so the same client works against local Docker
 * Postgres and a pooled Neon endpoint without configuration changes.
 */
export function createPrismaClient(options: CreateOptions = {}): PrismaClient {
  const connectionString = options.connectionString ?? process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env at the repository root.')
  }
  const adapter = new PrismaPg({ connectionString })
  return new PrismaClient({ adapter, log: options.log ?? ['warn', 'error'] })
}

const globalForPrisma = globalThis as typeof globalThis & { __storyboardPrisma?: PrismaClient }

function getSharedClient(): PrismaClient {
  // Cached on globalThis outside production so Next.js hot reloads do not open
  // a new connection pool on every edit.
  globalForPrisma.__storyboardPrisma ??= createPrismaClient()
  return globalForPrisma.__storyboardPrisma
}

/**
 * The shared client. Created on first use, not on import, so modules that
 * import `@storyboard/db` (unit tests, tooling, build-time code paths) do not
 * need a database until they actually query one.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    const client = getSharedClient()
    const value: unknown = Reflect.get(client, property, receiver)
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(client)
      : value
  },
})
