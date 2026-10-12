/**
 * The guard that keeps `pnpm test` off the live database (decision 0028).
 * `.env` names that database on a laptop with no Postgres of its own, and the
 * database suites create accounts and run the purge.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { isLocalDatabase, keepTestsOffHostedDatabases } from './env.js'

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
