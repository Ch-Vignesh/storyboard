/**
 * FR-1.3 step 3, with decision 0027 — choosing a username keeps a display name
 * that is already there (phase 14, item 1.3). It overwrote the name Google had
 * stored, so "Ada Lovelace" was credited everywhere as "ada-l".
 *
 * Needs a real Postgres, so it skips when DATABASE_URL is unset. CI runs it.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PINNED_GENRES_MIN } from '@/lib/schemas/constants'

vi.mock('@/auth', () => ({ auth: async () => null }))

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('choosing a username (FR-1.3)', () => {
  let db: PrismaClient
  const people: string[] = []

  /** An account past the password step and before the username step. */
  async function newcomer(displayName: string | null) {
    const run = randomUUID().replaceAll('-', '').slice(0, 8)
    const row = await db.user.create({
      data: { email: `user-${run}@example.test`, emailVerifiedAt: new Date(), displayName },
      select: { id: true },
    })
    people.push(row.id)
    return { id: row.id, run }
  }

  async function as(userId: string) {
    const { createCallerFactory } = await import('../init')
    const { appRouter } = await import('./_app')
    return createCallerFactory(appRouter)({
      db,
      session: { user: { id: userId, username: null, onboarded: false }, expires: '' },
      account: {
        status: 'ACTIVE',
        isAdmin: false,
        role: 'USER' as const,
        grants: [],
        deletionRequestedAt: null,
        username: null,
      },
      headers: new Headers(),
    })
  }

  beforeAll(() => {
    db = createPrismaClient({ log: [] })
  })

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { in: people } } })
    await db.$disconnect()
  })

  it('keeps a display name that is already there', async () => {
    const ada = await newcomer('Ada Lovelace')
    const username = `ada-${ada.run}`
    await (await as(ada.id)).user.chooseUsername({ username })
    const row = await db.user.findUniqueOrThrow({
      where: { id: ada.id },
      select: { username: true, displayName: true },
    })
    expect(row).toEqual({ username, displayName: 'Ada Lovelace' })
  })

  /** FR-1.3 with decisions 0011 and 0024 (phase 14, item 1.6; decision 0042). */
  it('refuses a name that belonged to a deleted account', async () => {
    const { createHash } = await import('node:crypto')
    const retired = `gone-${randomUUID().replaceAll('-', '').slice(0, 8)}`
    const hash = createHash('sha256').update(retired).digest('hex')
    await db.retiredUsername.create({ data: { hash, retiredAt: new Date() } })

    const who = await newcomer(null)
    const call = await as(who.id)
    expect(await call.user.usernameAvailable({ username: retired })).toMatchObject({
      available: false,
    })
    await expect(call.user.chooseUsername({ username: retired })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      // As for any taken name: nothing says an account was deleted (owner, D-4).
      message: expect.stringMatching(/is taken/i),
    })
    await db.retiredUsername.delete({ where: { hash } })
  })

  /** Decision 0043 (phase 14, item 2b.6) — a banned name, the same way. */
  it('refuses a name an administrator banned, with the same sentence', async () => {
    const banned = `vile-${randomUUID().replaceAll('-', '').slice(0, 8)}`
    const { createHash } = await import('node:crypto')
    const hash = createHash('sha256').update(banned).digest('hex')
    await db.retiredUsername.create({
      data: { hash, reason: 'BANNED', name: banned, note: 'A slur.' },
    })

    const who = await newcomer(null)
    const call = await as(who.id)
    expect(await call.user.usernameAvailable({ username: banned })).toMatchObject({
      available: false,
    })
    await expect(call.user.chooseUsername({ username: banned })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringMatching(/is taken/i),
    })
    await db.retiredUsername.delete({ where: { hash } })
  })

  it('uses the username as the display name when there is none', async () => {
    const nobody = await newcomer(null)
    const username = `nobody-${nobody.run}`
    await (await as(nobody.id)).user.chooseUsername({ username })
    const row = await db.user.findUniqueOrThrow({
      where: { id: nobody.id },
      select: { displayName: true },
    })
    expect(row.displayName).toBe(username)
  })

  /**
   * FR-13.4 (phase 14, item 2.3) — the rules are read, and recorded as read,
   * on the last onboarding step, and asked once.
   */
  it('records that the rules were read when onboarding finishes, and refuses without the tick', async () => {
    const who = await newcomer('Reads Rules')
    const username = `rules-${who.run}`
    await (await as(who.id)).user.chooseUsername({ username })
    const genreIds: string[] = []
    for (let i = 0; i < PINNED_GENRES_MIN; i += 1) {
      const genre = await db.genre.create({
        data: { slug: `t-${who.run}-${String(i)}`, name: `Test genre ${String(i)}` },
        select: { id: true },
      })
      genreIds.push(genre.id)
    }
    // Past the username step: the context carries the name, as the real one would.
    const { createCallerFactory } = await import('../init')
    const { appRouter } = await import('./_app')
    const call = createCallerFactory(appRouter)({
      db,
      session: { user: { id: who.id, username, onboarded: false }, expires: '' },
      account: {
        status: 'ACTIVE',
        isAdmin: false,
        role: 'USER' as const,
        grants: [],
        deletionRequestedAt: null,
        username,
      },
      headers: new Headers(),
    })

    await expect(call.user.pinGenres({ genreIds })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringMatching(/community rules/u),
    })
    expect((await db.user.findUniqueOrThrow({ where: { id: who.id } })).rulesSeenAt).toBeNull()

    await call.user.pinGenres({ genreIds, rulesRead: true })
    const after = await db.user.findUniqueOrThrow({ where: { id: who.id } })
    expect(after.rulesSeenAt).not.toBeNull()
    expect(after.onboardedAt).not.toBeNull()
    // Asked once: re-pinning later, as settings does, needs no tick.
    await expect(call.user.pinGenres({ genreIds })).resolves.toMatchObject({ onboarded: true })

    await db.userGenre.deleteMany({ where: { userId: who.id } })
    await db.genre.deleteMany({ where: { id: { in: genreIds } } })
  })
})
