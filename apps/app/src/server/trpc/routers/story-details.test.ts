/**
 * Phase 14, items 8.4 and 8.10 — a story's details. The type changes within
 * its family and is refused across, with the reason (FR-2.1, D-16); every
 * author may change the details, and the owner alone the rest (SRS 3.2).
 * Needs a real Postgres, so it skips when DATABASE_URL is unset. CI runs it.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { TYPE_FAMILY_COPY } from '@/lib/schemas/storyboard'

vi.mock('@/auth', () => ({ auth: async () => null }))

const databaseUrl = process.env.DATABASE_URL

type Who = { id: string; username: string }

describe.skipIf(!databaseUrl)('a story’s details (items 8.4 and 8.10)', () => {
  let db: PrismaClient
  const people: string[] = []
  const stories: string[] = []
  const run = randomUUID().replaceAll('-', '').slice(0, 8)
  let owner: Who = { id: '', username: '' }
  let coauthor: Who = { id: '', username: '' }
  let reader: Who = { id: '', username: '' }

  async function person(label: string): Promise<Who> {
    const username = `sd-${label}-${run}`
    const row = await db.user.create({
      data: { email: `${username}@example.test`, username, emailVerifiedAt: new Date() },
      select: { id: true },
    })
    people.push(row.id)
    return { id: row.id, username }
  }

  async function as(who: Who) {
    const { createCallerFactory } = await import('../init')
    const { appRouter } = await import('./_app')
    return createCallerFactory(appRouter)({
      db,
      session: { user: { id: who.id, username: who.username, onboarded: true }, expires: '' },
      account: {
        status: 'ACTIVE',
        isAdmin: false,
        role: 'USER' as const,
        grants: [],
        deletionRequestedAt: null,
        username: who.username,
      },
      headers: new Headers(),
    })
  }

  async function story(type: 'NOVEL' | 'SCREENPLAY') {
    const tag = randomUUID().replaceAll('-', '').slice(0, 8)
    const row = await db.storyboard.create({
      data: {
        publicId: `sd${tag}`,
        slug: `details-${tag}`,
        title: 'Before',
        type,
        visibility: 'PUBLIC',
        publicFrom: new Date(),
        ownerId: owner.id,
        collaborators: {
          create: {
            userId: coauthor.id,
            invitedById: owner.id,
            role: 'COAUTHOR',
            acceptedAt: new Date(),
          },
        },
      },
      select: { id: true },
    })
    stories.push(row.id)
    return row.id
  }

  const typeOf = async (id: string) =>
    (await db.storyboard.findUniqueOrThrow({ where: { id }, select: { type: true } })).type

  beforeAll(async () => {
    db = createPrismaClient({ log: [] })
    owner = await person('owner')
    coauthor = await person('coauthor')
    reader = await person('reader')
  })

  afterAll(async () => {
    await db.storyboard.deleteMany({ where: { id: { in: stories } } })
    await db.user.deleteMany({ where: { id: { in: people } } })
    await db.$disconnect()
  })

  it('changes a prose type to another prose type', async () => {
    const id = await story('NOVEL')
    await (await as(owner)).storyboard.update({ storyboardId: id, type: 'POETRY' })
    expect(await typeOf(id)).toBe('POETRY')
  })

  it('refuses prose to a script, and says why', async () => {
    const id = await story('NOVEL')
    await expect(
      (await as(owner)).storyboard.update({ storyboardId: id, type: 'SCREENPLAY' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: TYPE_FAMILY_COPY.prose })
    expect(await typeOf(id)).toBe('NOVEL')
  })

  it('changes a screenplay to a stage play, and refuses it prose', async () => {
    const id = await story('SCREENPLAY')
    const call = await as(owner)
    await call.storyboard.update({ storyboardId: id, type: 'STAGE_PLAY' })
    expect(await typeOf(id)).toBe('STAGE_PLAY')
    await expect(
      call.storyboard.update({ storyboardId: id, type: 'NONFICTION' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: TYPE_FAMILY_COPY.screenplay })
    // A refused change changes nothing else in the same call either.
    await expect(
      call.storyboard.update({ storyboardId: id, title: 'After', type: 'NOVEL' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(
      (await db.storyboard.findUniqueOrThrow({ where: { id }, select: { title: true } })).title,
    ).toBe('Before')
  })

  it('lets a co-author change the details, the type included, and not the owner’s parts', async () => {
    const id = await story('NOVEL')
    const call = await as(coauthor)
    await call.storyboard.update({ storyboardId: id, title: 'Theirs too', type: 'NOVELLA' })
    expect(
      await db.storyboard.findUniqueOrThrow({ where: { id }, select: { title: true, type: true } }),
    ).toEqual({ title: 'Theirs too', type: 'NOVELLA' })
    await expect(
      call.storyboard.markFinished({ storyboardId: id, finished: true }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      call.storyboard.setVisibility({ storyboardId: id, visibility: 'PRIVATE' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(call.storyboard.delete({ storyboardId: id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('lets a reader change nothing', async () => {
    const id = await story('NOVEL')
    await expect(
      (await as(reader)).storyboard.update({ storyboardId: id, type: 'POETRY' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(await typeOf(id)).toBe('NOVEL')
  })
})
