/**
 * The sliding window (FR-13.3, decision 0017).
 *
 * The property that matters is in the name: "ten in the last twenty-four
 * hours", not "ten since midnight". A fixed window lets somebody send ten at
 * 23:59 and ten more at 00:01, which is the failure this limit exists to
 * prevent — so the test that earns its place is the one about time passing.
 *
 * Needs a real Postgres, so it skips when DATABASE_URL is unset. CI runs it.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { consume, key, pruneRateLimits, used, whenToRetry, DAY_MS, HOUR_MS } from './index'

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('rate limits', () => {
  let db: PrismaClient
  const run = randomUUID().replaceAll('-', '').slice(0, 10)
  const bucket = (name: string) => `test:${run}:${name}`

  beforeAll(() => {
    db = createPrismaClient({ log: [] })
  })

  afterAll(async () => {
    await db.rateLimitHit.deleteMany({ where: { key: { startsWith: `test:${run}:` } } })
    await db.$disconnect()
  })

  it('allows up to the limit and then refuses', async () => {
    const k = bucket('basic')
    for (let index = 0; index < 3; index += 1) {
      const verdict = await consume(db, k, { limit: 3, windowMs: DAY_MS })
      expect(verdict.ok, `attempt ${String(index + 1)}`).toBe(true)
      expect(verdict.remaining).toBe(3 - index - 1)
    }

    const fourth = await consume(db, k, { limit: 3, windowMs: DAY_MS })
    expect(fourth.ok).toBe(false)
    expect(fourth.remaining).toBe(0)
    expect(fourth.retryAt).toBeInstanceOf(Date)
  })

  it('does not record a hit when it refuses', async () => {
    const k = bucket('no-record')
    await consume(db, k, { limit: 1, windowMs: DAY_MS })
    await consume(db, k, { limit: 1, windowMs: DAY_MS })
    await consume(db, k, { limit: 1, windowMs: DAY_MS })

    // One allowed, two refused — and a refusal that recorded a hit would make
    // the window slide forward every time somebody bounced off it.
    expect(await used(db, k, DAY_MS)).toBe(1)
  })

  it('slides: a hit that falls out of the window frees a slot', async () => {
    const k = bucket('sliding')
    // Two hits, one of them yesterday.
    await db.rateLimitHit.createMany({
      data: [{ key: k, at: new Date(Date.now() - 25 * 60 * 60 * 1000) }, { key: k }],
    })

    const verdict = await consume(db, k, { limit: 2, windowMs: DAY_MS })
    expect(verdict.ok).toBe(true)

    // With a fixed calendar window both would still count and this would fail.
    expect(await used(db, k, DAY_MS)).toBe(2)
  })

  it('keeps buckets apart', async () => {
    const mine = bucket('mine')
    const yours = bucket('yours')
    await consume(db, mine, { limit: 1, windowMs: DAY_MS })

    expect((await consume(db, mine, { limit: 1, windowMs: DAY_MS })).ok).toBe(false)
    expect((await consume(db, yours, { limit: 1, windowMs: DAY_MS })).ok).toBe(true)
  })

  it('says when to come back, in words', async () => {
    expect(whenToRetry(null)).toBe('in a while')
    expect(whenToRetry(new Date(Date.now() + 5 * 60 * 1000))).toMatch(/in \d+ minutes/u)
    expect(whenToRetry(new Date(Date.now() + 3 * HOUR_MS))).toMatch(/about \d+ hours/u)
    expect(whenToRetry(new Date(Date.now() + 20 * HOUR_MS))).toBe('tomorrow')
  })

  it('prunes rows that have fallen out of every window', async () => {
    const k = bucket('prune')
    await db.rateLimitHit.createMany({
      data: [
        { key: k, at: new Date(Date.now() - 48 * 60 * 60 * 1000) },
        { key: k, at: new Date(Date.now() - 25 * 60 * 60 * 1000) },
        { key: k },
      ],
    })

    await pruneRateLimits(db)

    const left = await db.rateLimitHit.count({ where: { key: k } })
    expect(left).toBe(1)
  })

  it('builds keys that cannot collide by accident', () => {
    expect(key.suggestionsSent('u1')).not.toBe(key.ideasPosted('u1'))
    expect(key.spinOff('u1', 's1')).not.toBe(key.spinOff('u1', 's2'))
    // An address is normalised, so Case@Example and case@example are one bucket.
    expect(key.signUp('Case@Example.test')).toBe(key.signUp('case@example.test'))
  })
})
