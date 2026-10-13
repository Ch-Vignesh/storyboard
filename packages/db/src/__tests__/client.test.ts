/**
 * Decision 0028 — Prisma also issues `prisma+postgres://` URLs, beside the real
 * one in older integrations. They are for Prisma Accelerate, and node-postgres would treat one as
 * a host to dial. Refused at construction, so no database is needed here.
 */
import { describe, expect, it } from 'vitest'

import { createPrismaClient, explicitSslMode } from '../client'

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

describe('explicitSslMode (phase 10)', () => {
  it('says verify-full where node-postgres already means it', () => {
    expect(explicitSslMode('postgres://u:p@db.example:5432/postgres?sslmode=require')).toBe(
      'postgres://u:p@db.example:5432/postgres?sslmode=verify-full',
    )
  })

  it('leaves the other parameters exactly where they were', () => {
    expect(
      explicitSslMode('postgres://u:p@h/db?application_name=x&sslmode=require&connect_timeout=5'),
    ).toBe('postgres://u:p@h/db?application_name=x&sslmode=verify-full&connect_timeout=5')
  })

  it.each([
    'postgresql://storyboard:storyboard@localhost:5432/storyboard',
    'postgres://u:p@h/db?sslmode=disable',
    'postgres://u:p@h/db?sslmode=verify-full',
    // A password that merely contains the words is not a parameter.
    'postgres://u:sslmode=require@h/db',
  ])('changes nothing else: %s', (url) => {
    expect(explicitSslMode(url)).toBe(url)
  })
})
