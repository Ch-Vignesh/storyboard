/**
 * Phase 14, item 9.8 — which profiles the sitemap offers: people with work
 * anyone may read, and nobody whose only work is private, hidden, or whose
 * account is under review or on its way out.
 *
 * Needs a real Postgres, so it skips when DATABASE_URL is unset. CI runs it.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { profilesWithPublicWork } from './sitemap'

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('profiles in the sitemap (item 9.8)', () => {
  let db: PrismaClient
  const run = randomUUID().replaceAll('-', '').slice(0, 8)
  const people: string[] = []
  const stories: string[] = []
  let listed: string[] = []

  async function person(label: string, data: { status?: 'SUSPENDED'; deleting?: boolean } = {}) {
    const username = `sm-${label}-${run}`
    const row = await db.user.create({
      data: {
        email: `${username}@example.test`,
        username,
        emailVerifiedAt: new Date(),
        status: data.status ?? 'ACTIVE',
        deletionRequestedAt: data.deleting ? new Date() : null,
      },
      select: { id: true },
    })
    people.push(row.id)
    return { id: row.id, username }
  }

  async function story(ownerId: string, visibility: 'PUBLIC' | 'PRIVATE', hidden = false) {
    const id = randomUUID().replaceAll('-', '').slice(0, 10)
    const row = await db.storyboard.create({
      data: {
        publicId: `sm${id}`,
        slug: `sm-${id}`,
        title: 'A story for the sitemap',
        type: 'NOVEL',
        visibility,
        publicFrom: visibility === 'PUBLIC' ? new Date() : null,
        hiddenAt: hidden ? new Date() : null,
        ownerId,
      },
      select: { id: true },
    })
    stories.push(row.id)
    return row.id
  }

  let writer = { id: '', username: '' }
  let privateWriter = { id: '', username: '' }
  let helper = { id: '', username: '' }
  let privateHelper = { id: '', username: '' }
  let hiddenWriter = { id: '', username: '' }
  let suspended = { id: '', username: '' }
  let leaving = { id: '', username: '' }
  let reader = { id: '', username: '' }

  beforeAll(async () => {
    db = createPrismaClient({ log: [] })
    writer = await person('writer')
    privateWriter = await person('private')
    helper = await person('helper')
    privateHelper = await person('privhelp')
    hiddenWriter = await person('hidden')
    suspended = await person('suspended', { status: 'SUSPENDED' })
    leaving = await person('leaving', { deleting: true })
    reader = await person('reader')

    const open = await story(writer.id, 'PUBLIC')
    const kept = await story(privateWriter.id, 'PRIVATE')
    await story(hiddenWriter.id, 'PUBLIC', true)
    await story(suspended.id, 'PUBLIC')
    await story(leaving.id, 'PUBLIC')
    await db.credit.createMany({
      data: [
        { storyboardId: open, contributorId: helper.id, type: 'IDEA' },
        { storyboardId: kept, contributorId: privateHelper.id, type: 'IDEA' },
      ],
    })

    listed = await profilesWithPublicWork(db, 100_000)
  })

  afterAll(async () => {
    await db.credit.deleteMany({ where: { storyboardId: { in: stories } } })
    await db.storyboard.deleteMany({ where: { id: { in: stories } } })
    await db.user.deleteMany({ where: { id: { in: people } } })
    await db.$disconnect()
  })

  it('offers somebody with a public story, and somebody credited on one', () => {
    expect(listed).toContain(writer.username)
    expect(listed).toContain(helper.username)
  })

  it('offers nobody whose only work is private or hidden, or who has none', () => {
    expect(listed).not.toContain(privateWriter.username)
    expect(listed).not.toContain(privateHelper.username)
    expect(listed).not.toContain(hiddenWriter.username)
    expect(listed).not.toContain(reader.username)
  })

  it('offers nobody suspended or on the way out, whatever they wrote', () => {
    expect(listed).not.toContain(suspended.username)
    expect(listed).not.toContain(leaving.username)
  })
})
