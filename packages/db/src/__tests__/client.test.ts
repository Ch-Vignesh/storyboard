/**
 * Decision 0028 — Prisma Postgres hands out a `prisma+postgres://` URL beside
 * the real one. It is for Prisma Accelerate, and node-postgres would treat it as
 * a host to dial. Refused at construction, so no database is needed here.
 */
import { describe, expect, it } from 'vitest'

import { createPrismaClient } from '../client'

describe('createPrismaClient', () => {
  it('refuses the Accelerate URL and names the one to use instead', () => {
    expect(() =>
      createPrismaClient({
        connectionString: 'prisma+postgres://accelerate.prisma-data.net/?api_key=not-a-key',
      }),
    ).toThrow(/must be a postgres:\/\/ connection string/)
  })

  it.each([
    'postgres://user:secret@pooled.db.prisma.io:5432/postgres?sslmode=require',
    'postgresql://storyboard:storyboard@localhost:5432/storyboard',
  ])('accepts %s without connecting', async (connectionString) => {
    const client = createPrismaClient({ connectionString })
    await client.$disconnect()
  })
})
