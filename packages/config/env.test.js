/**
 * The guard that keeps `pnpm test` off the live database (decision 0028).
 * `.env` names that database on a laptop with no Postgres of its own, and the
 * database suites create accounts and run the purge.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { isLocalDatabase, keepTestsOffHostedDatabases, sameDatabase } from './env.js'

describe('isLocalDatabase', () => {
  it.each([
    'postgresql://storyboard:storyboard@localhost:5432/storyboard',
    'postgresql://storyboard:storyboard@127.0.0.1:5432/storyboard',
    'postgresql://storyboard:storyboard@[::1]:5432/storyboard',
  ])('a database on this machine: %s', (url) => {
    expect(isLocalDatabase(url)).toBe(true)
  })

  it.each([
    'postgres://user:secret@pooled.db.prisma.io:5432/postgres?sslmode=require',
    'postgres://user:secret@db.prisma.io:5432/postgres?sslmode=require',
    // A name that starts like a local one is still somebody else's machine.
    'postgresql://user:secret@localhost.example.com:5432/storyboard',
    // Anything that does not parse is refused by whoever asked.
    'not a connection string',
    '',
  ])('not a database on this machine: %s', (url) => {
    expect(isLocalDatabase(url)).toBe(false)
  })
})

describe('sameDatabase', () => {
  const prisma = (user, host = 'db.prisma.io') =>
    `postgres://${user}:sk_secret@${host}:5432/postgres?sslmode=require`

  it.each([
    ['a pool and its direct host', prisma('a1b2', 'pooled.db.prisma.io'), prisma('a1b2')],
    [
      "Neon's pooler and its endpoint",
      'postgres://owner:pw@ep-cool-123-pooler.us-east-2.aws.neon.tech/neondb',
      'postgres://owner:pw@ep-cool-123.us-east-2.aws.neon.tech/neondb?sslmode=require',
    ],
    [
      'the default port, written and not',
      'postgresql://storyboard:storyboard@localhost/storyboard',
      'postgresql://storyboard:other@localhost:5432/storyboard',
    ],
  ])('one database: %s', (_, a, b) => {
    expect(sameDatabase(a, b)).toBe(true)
    expect(sameDatabase(b, a)).toBe(true)
  })

  it.each([
    // Every Prisma Postgres database is db.prisma.io:5432/postgres. Comparing
    // only the place refused a restore drill on any of them (decision 0032).
    ['two databases on a shared host', prisma('a1b2'), prisma('c3d4')],
    [
      'a pool and somebody else’s direct host',
      prisma('a1b2', 'pooled.db.prisma.io'),
      prisma('c3d4'),
    ],
    [
      'two names on one server',
      'postgresql://storyboard:storyboard@localhost:5432/storyboard',
      'postgresql://storyboard:storyboard@localhost:5432/storyboard_restored',
    ],
    [
      'two ports on one machine',
      'postgresql://storyboard:storyboard@localhost:5432/storyboard',
      'postgresql://storyboard:storyboard@localhost:5433/storyboard',
    ],
    ['strings that do not parse, and differ', 'not a url', 'also not a url'],
  ])('two databases: %s', (_, a, b) => {
    expect(sameDatabase(a, b)).toBe(false)
  })
})

describe('keepTestsOffHostedDatabases', () => {
  const saved = {
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_DATABASE_URL: process.env.DIRECT_DATABASE_URL,
  }

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('empties a hosted URL and its direct twin, and says which host it refused', () => {
    process.env.DATABASE_URL = 'postgres://user:secret@pooled.db.prisma.io:5432/postgres'
    process.env.DIRECT_DATABASE_URL = 'postgres://user:secret@db.prisma.io:5432/postgres'

    keepTestsOffHostedDatabases()

    // Empty rather than deleted, so a later loadRootEnv() cannot restore them.
    expect(process.env.DATABASE_URL).toBe('')
    expect(process.env.DIRECT_DATABASE_URL).toBe('')
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('pooled.db.prisma.io'))
    expect(console.warn).not.toHaveBeenCalledWith(expect.stringContaining('secret'))
  })

  it('leaves a local URL alone, and says nothing', () => {
    const local = 'postgresql://storyboard:storyboard@localhost:5432/storyboard'
    process.env.DATABASE_URL = local

    keepTestsOffHostedDatabases()

    expect(process.env.DATABASE_URL).toBe(local)
    expect(console.warn).not.toHaveBeenCalled()
  })
})
