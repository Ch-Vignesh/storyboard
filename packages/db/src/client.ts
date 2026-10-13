import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from './generated/prisma/client'

type CreateOptions = {
  /** Defaults to process.env.DATABASE_URL. */
  connectionString?: string
  /** Prisma log levels. Defaults to warnings and errors. */
  log?: Array<'query' | 'info' | 'warn' | 'error'>
  /**
   * Interactive transaction limits, in milliseconds. Prisma's defaults — 2 s
   * to get a connection, 5 s to finish — are sized for a web request next to
   * its database. A batch run across the internet needs more.
   */
  transactionOptions?: { maxWait: number; timeout: number }
}

/**
 * The connection pool, sized for a serverless host behind a database pooler
 * (phase 10). node-postgres defaults to ten connections per instance and to
 * waiting forever for one; Prisma Postgres's Free plan allows ten in total. So
 * an instance keeps few, a request that cannot get one fails in seconds rather
 * than hanging until the platform kills it, and an idle connection is kept for
 * a minute so the next request does not pay for a new TLS handshake.
 */
const POOL = { max: 5, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 60_000 } as const

/**
 * node-postgres 8 already treats `sslmode=require` as `verify-full` — it checks
 * the certificate — and warns on every cold start that version 9 will stop
 * doing so. Say what is meant, and the warning and the future weakening both go.
 */
export function explicitSslMode(connectionString: string): string {
  return connectionString.replace(/([?&]sslmode=)require(?=&|$)/u, '$1verify-full')
}

/**
 * Build a Prisma client backed by node-postgres. Prisma 7 talks to Postgres
 * through a driver adapter, so the same client works against local Docker
 * Postgres and a pooled Prisma Postgres endpoint without configuration changes.
 */
export function createPrismaClient(options: CreateOptions = {}): PrismaClient {
  const connectionString = options.connectionString ?? process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env at the repository root.')
  }
  // Prisma also issues `prisma+postgres://` URLs, for Prisma Accelerate, which
  // speaks HTTP; node-postgres would read one as a host to dial on 5432 and
  // fail somewhere far less obvious than here.
  if (!/^postgres(ql)?:\/\//.test(connectionString)) {
    throw new Error(
      'DATABASE_URL must be a postgres:// connection string. A prisma+postgres:// URL is for ' +
        'Prisma Accelerate, which this application does not use; take the postgres:// one.',
    )
  }
  const adapter = new PrismaPg({
    connectionString: explicitSslMode(connectionString),
    ...POOL,
  })
  return new PrismaClient({
    adapter,
    log: options.log ?? ['warn', 'error'],
    ...(options.transactionOptions && { transactionOptions: options.transactionOptions }),
  })
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
