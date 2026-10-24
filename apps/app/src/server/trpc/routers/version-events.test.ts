/**
 * Phase 14, item 7.10 (FR-10.2) — "promotion swaps is_main and records the
 * swap in storyboard history". A promotion writes a `VersionEvent` with both
 * names as they were; a demoted draft still called "Main draft" is dated, so
 * the reader never calls an alternate by the main draft's name; a name the
 * author chose is kept; and the Versions page's list carries the history.
 *
 * Needs a real Postgres, so it skips when DATABASE_URL is unset. CI runs it.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/auth', () => ({ auth: async () => null }))

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('a promotion is recorded (item 7.10)', () => {
  let db: PrismaClient
  const run = randomUUID().replaceAll('-', '').slice(0, 8)
  let owner = { id: '', username: '' }
  let storyboardId = ''
  let mainId = ''
  let alternateId = ''

  async function version(name: string, isMain: boolean) {
    const row = await db.version.create({
      data: { storyboardId, name, isMain, createdById: owner.id },
      select: { id: true },
    })
    await db.chapter.create({
      data: { versionId: row.id, lineageId: randomUUID(), order: 0, title: 'One' },
    })
    return row.id
  }

  async function asOwner() {
    const { createCallerFactory } = await import('../init')
    const { appRouter } = await import('./_app')
    return createCallerFactory(appRouter)({
      db,
      session: { user: { id: owner.id, username: owner.username, onboarded: true }, expires: '' },
      account: {
        status: 'ACTIVE',
        isAdmin: false,
        role: 'USER' as const,
        grants: [],
        deletionRequestedAt: null,
        username: owner.username,
      },
      headers: new Headers({ 'x-time-zone': 'UTC' }),
    })
  }

  beforeAll(async () => {
    db = createPrismaClient({ log: [] })
    const username = `ve-owner-${run}`
    const user = await db.user.create({
      data: {
        email: `${username}@example.test`,
        username,
        displayName: 'Maya',
        emailVerifiedAt: new Date(),
      },
      select: { id: true },
    })
    owner = { id: user.id, username }
    const storyboard = await db.storyboard.create({
      data: {
        publicId: `ve${run}`,
        slug: `version-events-${run}`,
        title: 'Swaps',
        type: 'NOVEL',
        visibility: 'PRIVATE',
        ownerId: owner.id,
      },
      select: { id: true },
    })
    storyboardId = storyboard.id
    mainId = await version('Main draft', true)
    alternateId = await version('Ship never lands', false)
  })

  afterAll(async () => {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`select set_config('storyboard.hard_delete', 'on', true)`)
      await tx.versionEvent.deleteMany({ where: { storyboardId } })
      await tx.chapter.deleteMany({ where: { version: { storyboardId } } })
      await tx.version.deleteMany({ where: { storyboardId } })
      await tx.storyboard.deleteMany({ where: { id: storyboardId } })
      await tx.user.deleteMany({ where: { id: owner.id } })
    })
    await db.$disconnect()
  })

  it('records the swap, and dates a demoted "Main draft"', async () => {
    const owner = await asOwner()
    const result = await owner.version.promoteToMain({ versionId: alternateId })
    const today = new Date().toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    })
    expect(result.previousName).toBe(`Main draft until ${today}`)

    const demoted = await db.version.findUniqueOrThrow({
      where: { id: mainId },
      select: { name: true, isMain: true },
    })
    expect(demoted).toEqual({ name: `Main draft until ${today}`, isMain: false })

    const { events } = await owner.version.list({ storyboardId })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      kind: 'PROMOTED',
      versionName: 'Ship never lands',
      previousName: `Main draft until ${today}`,
      actor: { displayName: 'Maya' },
    })
  })

  it('keeps a name the author chose when it steps down', async () => {
    const owner = await asOwner()
    await owner.version.promoteToMain({ versionId: mainId })
    const kept = await db.version.findUniqueOrThrow({
      where: { id: alternateId },
      select: { name: true },
    })
    expect(kept.name).toBe('Ship never lands')

    const { events } = await owner.version.list({ storyboardId })
    expect(events.map((event) => event.previousName)).toEqual([
      'Ship never lands',
      expect.stringMatching(/^Main draft until /u),
    ])
  })
})
