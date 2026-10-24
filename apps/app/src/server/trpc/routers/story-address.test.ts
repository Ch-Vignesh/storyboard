/**
 * Phase 14, item 8.7 — renaming a story moves its address: a new title makes
 * `{slugified title}-{publicId}`; an address from before still finds the
 * story by the `publicId` it ends with; and `storyboard.currentSlug` tells the
 * new one only to someone who may read the story, whose new title it holds.
 *
 * Needs a real Postgres, so it skips when DATABASE_URL is unset. CI runs it.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/auth', () => ({ auth: async () => null }))

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('a story’s address follows its title (item 8.7)', () => {
  let db: PrismaClient
  const run = randomUUID().replaceAll('-', '').slice(0, 10)
  const people: string[] = []
  let owner = { id: '', username: '' }
  let stranger = { id: '', username: '' }
  let storyboardId = ''
  const publicId = run
  const oldSlug = `the-first-title-${run}`

  async function person(label: string) {
    const username = `ad-${label}-${run.slice(0, 6)}`
    const row = await db.user.create({
      data: { email: `${username}@example.test`, username, emailVerifiedAt: new Date() },
      select: { id: true },
    })
    people.push(row.id)
    return { id: row.id, username }
  }

  async function as(who: { id: string; username: string } | null) {
    const { createCallerFactory } = await import('../init')
    const { appRouter } = await import('./_app')
    return createCallerFactory(appRouter)({
      db,
      session: who
        ? { user: { id: who.id, username: who.username, onboarded: true }, expires: '' }
        : null,
      account: who
        ? {
            status: 'ACTIVE',
            isAdmin: false,
            role: 'USER' as const,
            grants: [],
            deletionRequestedAt: null,
            username: who.username,
          }
        : null,
      headers: new Headers(),
    })
  }

  beforeAll(async () => {
    db = createPrismaClient({ log: [] })
    owner = await person('owner')
    stranger = await person('stranger')
    const storyboard = await db.storyboard.create({
      data: {
        publicId,
        slug: oldSlug,
        title: 'The first title',
        type: 'NOVEL',
        visibility: 'PUBLIC',
        publicFrom: new Date(Date.now() - 60_000),
        ownerId: owner.id,
      },
      select: { id: true },
    })
    storyboardId = storyboard.id
    await db.version.create({
      data: { storyboardId, name: 'Main draft', isMain: true, createdById: owner.id },
    })
  })

  afterAll(async () => {
    await db.version.deleteMany({ where: { storyboardId } })
    await db.storyboard.deleteMany({ where: { id: storyboardId } })
    await db.user.deleteMany({ where: { id: { in: people } } })
    await db.$disconnect()
  })

  it('moves the address with a new title, and the old one still finds the story', async () => {
    const saved = await (
      await as(owner)
    ).storyboard.update({ storyboardId, title: 'A Better Title, At Last' })
    expect(saved.slug).toBe(`a-better-title-at-last-${publicId}`)

    const reader = await as(null)
    const { storyboard } = await reader.storyboard.get({ slug: oldSlug })
    expect(storyboard.slug).toBe(saved.slug)
    expect(await reader.storyboard.currentSlug({ slug: oldSlug })).toBe(saved.slug)
    expect(await reader.storyboard.currentSlug({ slug: saved.slug })).toBe(saved.slug)
  })

  it('tells the new address only to someone who may read the story', async () => {
    await db.storyboard.update({ where: { id: storyboardId }, data: { visibility: 'PRIVATE' } })
    expect(await (await as(stranger)).storyboard.currentSlug({ slug: oldSlug })).toBeNull()
    expect(await (await as(null)).storyboard.currentSlug({ slug: oldSlug })).toBeNull()
    expect(await (await as(owner)).storyboard.currentSlug({ slug: oldSlug })).toBe(
      `a-better-title-at-last-${publicId}`,
    )
    // An address that never was is nobody's.
    expect(
      await (await as(owner)).storyboard.currentSlug({ slug: 'no-such-story-0000000000' }),
    ).toBeNull()
  })
})
