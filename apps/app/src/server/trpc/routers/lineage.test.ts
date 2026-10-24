/**
 * Phase 14, item 7.11 (FR-10.5) — the full lineage. The banner asks for the
 * nearest `LINEAGE.shown` ancestors and is told there are more; the lineage
 * page asks for the whole chain, back to the first story, and is told whether
 * the walk reached `LINEAGE.walkMax`; a private ancestor is named only as one.
 *
 * Needs a real Postgres, so it skips when DATABASE_URL is unset. CI runs it.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { LINEAGE } from '@/lib/schemas/constants'

vi.mock('@/auth', () => ({ auth: async () => null }))

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('the full lineage (item 7.11)', () => {
  let db: PrismaClient
  const run = randomUUID().replaceAll('-', '').slice(0, 6)
  let ownerId = ''
  /** Oldest first: chain[0] started it, chain[5] is the newest spin-off. */
  const chain: string[] = []

  async function guest() {
    const { createCallerFactory } = await import('../init')
    const { appRouter } = await import('./_app')
    return createCallerFactory(appRouter)({
      db,
      session: null,
      account: null,
      headers: new Headers(),
    })
  }

  beforeAll(async () => {
    db = createPrismaClient({ log: [] })
    const owner = await db.user.create({
      data: { email: `ln-${run}@example.test`, username: `ln-${run}`, emailVerifiedAt: new Date() },
      select: { id: true },
    })
    ownerId = owner.id
    for (let generation = 0; generation < 6; generation += 1) {
      const row = await db.storyboard.create({
        data: {
          publicId: `ln${run}${String(generation)}`,
          slug: `lineage-${run}-${String(generation)}`,
          title: `Generation ${String(generation)}`,
          type: 'NOVEL',
          // The second story went private after it was spun off.
          visibility: generation === 1 ? 'PRIVATE' : 'PUBLIC',
          publicFrom: new Date(Date.now() - 60_000),
          ownerId,
          forkedFromId: chain[generation - 1] ?? null,
          forkedAt: generation > 0 ? new Date() : null,
        },
        select: { id: true },
      })
      chain.push(row.id)
    }
  })

  afterAll(async () => {
    for (const id of [...chain].reverse()) await db.storyboard.delete({ where: { id } })
    await db.user.delete({ where: { id: ownerId } })
    await db.$disconnect()
  })

  it('gives the banner the nearest three, and says there are more', async () => {
    const lineage = await (await guest()).spinOff.lineage({ storyboardId: chain[5]! })
    expect(lineage.ancestors.map((ancestor) => ancestor.title)).toEqual([
      'Generation 4',
      'Generation 3',
      'Generation 2',
    ])
    expect(lineage.truncated).toBe(true)
    expect(lineage.reachedCap).toBe(false)
  })

  it('gives the lineage page the whole chain, back to the first story', async () => {
    const lineage = await (await guest()).spinOff.lineage({ storyboardId: chain[5]!, full: true })
    expect(lineage.ancestors).toHaveLength(5)
    expect(lineage.ancestors[4]?.title).toBe('Generation 0')
    // A private ancestor is in the chain, and named only as one.
    expect(lineage.ancestors[3]).toMatchObject({
      title: 'a story that is no longer public',
      slug: null,
      hidden: true,
    })
    expect(lineage.truncated).toBe(false)
    expect(lineage.reachedCap).toBe(false)
  })

  it('says so when the walk stops at its cap', async () => {
    // A chain two longer than the cap, from the newest of the first one.
    for (let generation = 6; generation < LINEAGE.walkMax + 2; generation += 1) {
      const row = await db.storyboard.create({
        data: {
          publicId: `ln${run}${String(generation)}`,
          slug: `lineage-${run}-${String(generation)}`,
          title: `Generation ${String(generation)}`,
          type: 'NOVEL',
          visibility: 'PUBLIC',
          publicFrom: new Date(Date.now() - 60_000),
          ownerId,
          forkedFromId: chain[generation - 1]!,
          forkedAt: new Date(),
        },
        select: { id: true },
      })
      chain.push(row.id)
    }
    const newest = chain[chain.length - 1]!
    const lineage = await (await guest()).spinOff.lineage({ storyboardId: newest, full: true })
    expect(lineage.ancestors).toHaveLength(LINEAGE.walkMax)
    expect(lineage.reachedCap).toBe(true)
    expect(lineage.truncated).toBe(true)
  })
})
