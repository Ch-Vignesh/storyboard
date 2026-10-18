/**
 * Phase 12 audit findings on profiles: erasing a contribution reaches every
 * copy of it (FR-9.5, decision 0013), and what a profile says about an account
 * follows decisions 0018 and 0024.
 *
 * Needs a real Postgres, so it skips when DATABASE_URL is unset. CI runs it.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/auth', () => ({ auth: async () => null }))

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('profiles (phase 12 audit)', () => {
  let db: PrismaClient
  const people: string[] = []

  async function person(label: string, data: Record<string, unknown> = {}) {
    const run = randomUUID().replaceAll('-', '').slice(0, 8)
    const username = `pf-${label}-${run}`
    const row = await db.user.create({
      data: { email: `${username}@example.test`, username, emailVerifiedAt: new Date(), ...data },
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

  async function aStoryboard(ownerId: string) {
    const run = randomUUID().replaceAll('-', '').slice(0, 8)
    return db.storyboard.create({
      data: {
        publicId: `pf${run}`,
        slug: `profile-${run}`,
        title: 'Somewhere',
        type: 'NOVEL',
        visibility: 'PUBLIC',
        ownerId,
      },
      select: { id: true },
    })
  }

  /** A credit on an original, a copy of it in a spin-off, and a copy of that. */
  async function aCreditCopiedTwice(contributorId: string) {
    const original = await db.credit.create({
      data: { storyboardId: (await aStoryboard(contributorId)).id, contributorId, type: 'PROSE' },
      select: { id: true },
    })
    const copy = await db.credit.create({
      data: {
        storyboardId: (await aStoryboard(contributorId)).id,
        contributorId,
        type: 'PROSE',
        inheritedFromId: original.id,
      },
      select: { id: true },
    })
    const copyOfCopy = await db.credit.create({
      data: {
        storyboardId: (await aStoryboard(contributorId)).id,
        contributorId,
        type: 'PROSE',
        inheritedFromId: copy.id,
      },
      select: { id: true },
    })
    return [original.id, copy.id, copyOfCopy.id]
  }

  beforeAll(() => {
    db = createPrismaClient({ log: [] })
  })

  afterAll(async () => {
    await db.credit.updateMany({
      where: { storyboard: { ownerId: { in: people } } },
      data: { inheritedFromId: null },
    })
    await db.credit.deleteMany({ where: { storyboard: { ownerId: { in: people } } } })
    await db.storyboard.deleteMany({ where: { ownerId: { in: people } } })
    await db.activityDay.deleteMany({ where: { userId: { in: people } } })
    await db.user.deleteMany({ where: { id: { in: people } } })
    await db.$disconnect()
  })

  const stillNamed = (ids: string[]) =>
    db.credit.count({ where: { id: { in: ids }, erasedAt: null } })

  it('erases a contribution from every copy of it, however many spin-offs deep', async () => {
    const writer = await person('erase-down')
    const family = await aCreditCopiedTwice(writer.id)

    await (await as(writer)).profile.eraseContribution({ creditId: family[0]! })

    expect(await stillNamed(family)).toBe(0)
  })

  /**
   * FR-9.3 with FR-10.4. A spin-off's inherited copy of a credit was counted
   * and listed as a contribution of its own, so one passage counted once per
   * spin-off, and its credit line named the spin-off's owner as the author
   * written for (2026-10-16 spec review).
   */
  it('counts and lists a contribution once, however many spin-offs carry it', async () => {
    const writer = await person('counted-once')
    await aCreditCopiedTwice(writer.id)
    const visitor = await as(null)

    const profile = await visitor.profile.byUsername({ username: writer.username })
    expect(profile.counts.prose).toBe(1)
    expect(profile.credits).toHaveLength(1)
    const lines = await visitor.profile.creditLines({ username: writer.username })
    expect(lines.lines).toHaveLength(1)
  })

  it('erases the original too when asked from a copy', async () => {
    const writer = await person('erase-up')
    const family = await aCreditCopiedTwice(writer.id)

    await (await as(writer)).profile.eraseContribution({ creditId: family[1]! })

    expect(await stillNamed(family)).toBe(0)
  })

  it('tells only the account holder that their account is suspended (decision 0018)', async () => {
    const suspended = await person('suspended', { status: 'SUSPENDED' })
    const stranger = await person('stranger')

    const toStranger = await (
      await as(stranger)
    ).profile.byUsername({
      username: suspended.username,
    })
    const toGuest = await (await as(null)).profile.byUsername({ username: suspended.username })
    const toSelf = await (await as(suspended)).profile.byUsername({ username: suspended.username })

    expect(toStranger.user.suspended).toBe(false)
    expect(toGuest.user.suspended).toBe(false)
    expect(toSelf.user.suspended).toBe(true)
  })

  /**
   * Decision 0007. Only an author can send a suggestion to a private story;
   * once the story went public, what they sent then became readable to anyone.
   */
  it('keeps the words of a suggestion sent while the story was private', async () => {
    const owner = await person('private-era')
    const stranger = await person('later-reader')
    const run = randomUUID().replaceAll('-', '').slice(0, 8)
    const wentPublic = new Date()
    const storyboard = await db.storyboard.create({
      data: {
        publicId: `pe${run}`,
        slug: `private-era-${run}`,
        title: 'Once private',
        type: 'NOVEL',
        visibility: 'PUBLIC',
        publicFrom: wentPublic,
        ownerId: owner.id,
      },
      select: { id: true },
    })
    const version = await db.version.create({
      data: { storyboardId: storyboard.id, name: 'Main', isMain: true, createdById: owner.id },
      select: { id: true },
    })
    const chapter = await db.chapter.create({
      data: { versionId: version.id, lineageId: randomUUID(), order: 0, title: 'One' },
      select: { id: true },
    })
    const section = await db.section.create({
      data: { chapterId: chapter.id, lineageId: randomUUID(), order: 0 },
      select: { id: true },
    })
    const base = await db.revision.create({
      data: {
        sectionId: section.id,
        contentJson: { type: 'doc', content: [] },
        contentText: 'Base.',
        wordCount: 1,
        contentHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
        source: 'AUTHORED',
        authorId: owner.id,
      },
      select: { id: true },
    })
    const request = await db.contributionRequest.create({
      data: {
        publicId: `rq${run}`,
        storyboardId: storyboard.id,
        sectionId: section.id,
        kind: 'REWRITE',
        title: 'Before it was public',
        ask: 'Anything.',
        openedById: owner.id,
        state: 'ANSWERED',
      },
      select: { id: true, publicId: true },
    })
    const secret = await db.suggestion.create({
      data: {
        publicId: `sg${run}`,
        requestId: request.id,
        contributorId: owner.id,
        baseRevisionId: base.id,
        contentJson: { type: 'doc', content: [] },
        contentText: 'Words written while nobody else could see.',
        wordCount: 7,
        state: 'SUBMITTED',
        submittedAt: new Date(wentPublic.getTime() - 60_000),
      },
      select: { publicId: true },
    })

    try {
      const reader = await as(stranger)
      await expect(reader.suggestion.get({ publicId: secret.publicId })).rejects.toThrow(
        /does not exist/u,
      )
      const page = await reader.request.get({ publicId: request.publicId })
      expect(JSON.stringify(page)).not.toContain(secret.publicId)

      // The author still has it.
      const own = await (await as(owner)).suggestion.get({ publicId: secret.publicId })
      expect(own.suggestion.contentText).toContain('nobody else could see')
    } finally {
      await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`select set_config('storyboard.hard_delete', 'on', true)`)
        await tx.section.update({ where: { id: section.id }, data: { currentRevisionId: null } })
        await tx.$executeRaw`
          WITH gone AS (DELETE FROM "Suggestion" WHERE "requestId" = ${request.id})
          DELETE FROM "Revision" WHERE "sectionId" = ${section.id}`
        await tx.contributionRequest.delete({ where: { id: request.id } })
        await tx.section.delete({ where: { id: section.id } })
        await tx.chapter.delete({ where: { id: chapter.id } })
        await tx.version.delete({ where: { id: version.id } })
      })
    }
  })

  it('has no credit lines for an account being deleted, as it has no profile (decision 0024)', async () => {
    const leaving = await person('leaving', { deletionRequestedAt: new Date() })
    const guest = await as(null)

    await expect(guest.profile.byUsername({ username: leaving.username })).rejects.toThrow(
      /no such profile/iu,
    )
    await expect(guest.profile.creditLines({ username: leaving.username })).rejects.toThrow(
      /no such profile/iu,
    )
  })
})
