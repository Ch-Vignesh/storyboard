/**
 * Phase 14, item 9.4 (D-18) — the kill switches are seeded off, and seeding
 * again never moves one: a seed run during an incident must not switch a
 * pause off. Tried on a switch of the test's own, so the real ones are left
 * exactly as they stand.
 *
 * Needs a real Postgres with migrations applied, so it skips when DATABASE_URL
 * is unset. CI always runs it.
 */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { SEEDED_FLAGS, seedFlags } from '../../prisma/seed/flags'
import { createPrismaClient } from '../client'
import type { PrismaClient } from '../generated/prisma/client'

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('seeding the kill switches (item 9.4)', () => {
  let db: PrismaClient
  const key = `test-switch-${randomUUID().replaceAll('-', '').slice(0, 10)}`

  beforeAll(() => {
    db = createPrismaClient({ log: [] })
  })

  afterAll(async () => {
    await db.featureFlag.deleteMany({ where: { key } })
    await db.$disconnect()
  })

  it('makes a new switch off, and a second run makes nothing', async () => {
    const flags = [{ key, description: 'A switch for this test.' }]
    expect(await seedFlags(db, flags)).toEqual({ created: 1 })
    expect(await seedFlags(db, flags)).toEqual({ created: 0 })
    expect(await db.featureFlag.findUniqueOrThrow({ where: { key } })).toMatchObject({
      enabled: false,
      description: 'A switch for this test.',
    })
  })

  it('leaves a switch where an administrator put it, and brings only its words up to date', async () => {
    await db.featureFlag.update({ where: { key }, data: { enabled: true } })
    await seedFlags(db, [{ key, description: 'Clearer words for the same switch.' }])
    expect(await db.featureFlag.findUniqueOrThrow({ where: { key } })).toMatchObject({
      enabled: true,
      description: 'Clearer words for the same switch.',
    })
  })

  it('makes sure all three D-18 switches exist', async () => {
    await seedFlags(db)
    const found = await db.featureFlag.findMany({
      where: { key: { in: SEEDED_FLAGS.map((flag) => flag.key) } },
      select: { key: true },
    })
    expect(found.map((flag) => flag.key).sort()).toEqual(
      ['pause-imports', 'pause-sign-ups', 'pause-spin-offs'].sort(),
    )
  })
})
