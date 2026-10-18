/**
 * Asking for an account to be deleted is never silent (decision 0024; phase
 * 14, item 1.5). The confirmation is checked on the server, not only by a
 * disabled button, and the address hears at once, so an erasure scheduled
 * from a session that is not the owner's cannot go unnoticed for a week.
 *
 * Needs a real Postgres, so it skips when DATABASE_URL is unset. CI runs it.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { sessionRefused } from '@/auth/config'
import { hashPassword, verifyPassword } from '@/auth/password'
import { AUTH_LIMITS } from '@/lib/schemas/constants'
import type { Mail } from '@/server/mail/mailer'

const sent: Mail[] = []

vi.mock('@/server/mail/mailer', () => ({
  getMailer: () => ({
    send: async (mail: Mail) => {
      sent.push(mail)
    },
  }),
}))

vi.mock('@/auth', () => ({ auth: async () => null }))

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('asking for an account to be deleted (decision 0024)', () => {
  let db: PrismaClient
  const people: string[] = []

  async function person(withUsername = true) {
    const run = randomUUID().replaceAll('-', '').slice(0, 8)
    const row = await db.user.create({
      data: {
        email: `st-${run}@example.test`,
        username: withUsername ? `st-${run}` : null,
        emailVerifiedAt: new Date(),
      },
      select: { id: true, email: true, username: true },
    })
    people.push(row.id)
    return row
  }

  async function as(
    who: { id: string; username: string | null },
    deletionRequestedAt: Date | null = null,
  ) {
    const { createCallerFactory } = await import('../init')
    const { settingsRouter } = await import('./settings')
    return createCallerFactory(settingsRouter)({
      db,
      session: {
        user: { id: who.id, username: who.username, onboarded: who.username !== null },
        expires: '',
      },
      account: {
        status: 'ACTIVE',
        isAdmin: false,
        role: 'USER' as const,
        grants: [],
        deletionRequestedAt,
        username: who.username,
      },
      headers: new Headers(),
    })
  }

  beforeAll(() => {
    db = createPrismaClient({ log: [] })
  })

  beforeEach(() => {
    sent.length = 0
  })

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { in: people } } })
    await db.$disconnect()
  })

  it('refuses a confirmation that is not the username, and schedules nothing', async () => {
    const who = await person()
    await expect(
      (await as(who)).requestDeletion({ confirm: 'someone-else' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    const row = await db.user.findUniqueOrThrow({
      where: { id: who.id },
      select: { deletionRequestedAt: true },
    })
    expect(row.deletionRequestedAt).toBeNull()
    expect(sent).toEqual([])
  })

  it('takes the username, and tells the address at once', async () => {
    const who = await person()
    const result = await (await as(who)).requestDeletion({ confirm: who.username ?? '' })
    expect(result.finishesAt.getTime()).toBeGreaterThan(result.requestedAt.getTime())
    expect(sent.map((mail) => mail.to)).toEqual([who.email])
    expect(sent[0]?.text).toContain('/settings')
  })

  it('takes the email address when there is no username yet', async () => {
    const who = await person(false)
    await (await as(who)).requestDeletion({ confirm: who.email.toUpperCase() })
    const row = await db.user.findUniqueOrThrow({
      where: { id: who.id },
      select: { deletionRequestedAt: true },
    })
    expect(row.deletionRequestedAt).not.toBeNull()
  })

  it('is undone by keeping the account', async () => {
    const who = await person()
    await (await as(who)).requestDeletion({ confirm: who.username ?? '' })
    const frozen = await as(who, new Date())
    expect((await frozen.deletionStatus())?.requestedAt).toBeInstanceOf(Date)
    await frozen.cancelDeletion()
    expect(await frozen.deletionStatus()).toBeNull()
    const row = await db.user.findUniqueOrThrow({
      where: { id: who.id },
      select: { deletionRequestedAt: true },
    })
    expect(row.deletionRequestedAt).toBeNull()
  })

  /** Phase 14, item 3.1 — changing the password from settings. */
  it('changes the password for the right current one, refuses the wrong one and the same one', async () => {
    const who = await person()
    await db.user.update({
      where: { id: who.id },
      data: { passwordHash: await hashPassword('Old password 1!') },
    })
    const call = await as(who)

    await expect(
      call.changePassword({
        current: 'Not it 1!',
        next: 'New password 2?',
        confirm: 'New password 2?',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      call.changePassword({
        current: 'Old password 1!',
        next: 'Old password 1!',
        confirm: 'Old password 1!',
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringMatching(/already have/u),
    })
    await expect(
      call.changePassword({ current: 'Old password 1!', next: 'too weak', confirm: 'too weak' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(
      call.changePassword({
        current: 'Old password 1!',
        next: 'New password 2?',
        confirm: 'Other 2?',
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringMatching(/do not match/u),
    })

    const before = Date.now()
    const { changedAt } = await call.changePassword({
      current: 'Old password 1!',
      next: 'New password 2?',
      confirm: 'New password 2?',
    })
    const row = await db.user.findUniqueOrThrow({ where: { id: who.id } })
    expect(await verifyPassword(String(row.passwordHash), 'New password 2?')).toBe(true)
    expect(row.passwordChangedAt?.getTime()).toBeGreaterThanOrEqual(before)
    // Every other session is over (decision 0036); this browser signs in again.
    expect(
      sessionRefused(before - 60_000, { passwordChangedAt: changedAt, sessionsEndedAt: null }),
    ).toBe(true)
    expect(sent.map((mail) => mail.to)).toEqual([who.email])
    expect(sent[0]?.subject).toMatch(/password was changed/u)
  })

  it('tells a Google-only account to use the emailed link, and bounds the tries (decision 0037)', async () => {
    const googleOnly = await person()
    await expect(
      (await as(googleOnly)).changePassword({
        current: 'x',
        next: 'New password 2?',
        confirm: 'New password 2?',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: expect.stringMatching(/Google/u) })

    const who = await person()
    await db.user.update({
      where: { id: who.id },
      data: { passwordHash: await hashPassword('Old password 1!') },
    })
    const call = await as(who)
    for (let i = 0; i < AUTH_LIMITS.passwordChangesPerAccountPerHour; i += 1) {
      await expect(
        call.changePassword({
          current: 'wrong',
          next: 'New password 2?',
          confirm: 'New password 2?',
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    }
    // The limit is taken before anything is looked up: the right password is refused too now.
    await expect(
      call.changePassword({
        current: 'Old password 1!',
        next: 'New password 2?',
        confirm: 'New password 2?',
      }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' })
  })

  /** Phase 14, item 3.3 — "Sign out on every device". */
  it('ends every session, this one included', async () => {
    const who = await person()
    const signedInAt = Date.now() - 60_000
    const { endedAt } = await (await as(who)).signOutEverywhere()
    const row = await db.user.findUniqueOrThrow({ where: { id: who.id } })
    expect(row.sessionsEndedAt?.getTime()).toBe(endedAt.getTime())
    expect(sessionRefused(signedInAt, row)).toBe(true)
    expect(sessionRefused(endedAt.getTime() + 1, row)).toBe(false)
  })

  // Phase 14, item 3.8 — a display name cannot pose as somebody else, and
  // neither field keeps characters that are not writing.
  it('saves a cleaned profile, refuses a name that reads as somebody else', async () => {
    const who = await person()
    const call = await as(who)

    expect(
      await call.updateProfile({ displayName: '  Ada‍  Lovelace ', bio: '  Writes at night.​ ' }),
    ).toEqual({ displayName: 'Ada Lovelace', bio: 'Writes at night.' })
    // An empty bio is no bio.
    expect(await call.updateProfile({ displayName: 'Ada', bio: ' ​ ' })).toEqual({
      displayName: 'Ada',
      bio: null,
    })

    for (const posing of ['a former member', 'Draftboard team', 'admin']) {
      await expect(call.updateProfile({ displayName: posing, bio: null })).rejects.toThrow(
        /somebody else/u,
      )
    }
  })

  // Phase 14, item 3.15 — what a new story starts as.
  it('keeps the visibility new stories start as', async () => {
    const who = await person()
    const call = await as(who)
    expect(await call.setDefaultVisibility({ visibility: 'PRIVATE' })).toEqual({
      defaultVisibility: 'PRIVATE',
    })
    expect((await call.get()).user.defaultVisibility).toBe('PRIVATE')
  })

  // Phase 14, item 3.16 — Google can be turned off only when a password exists.
  it('turns Google sign-in off only for an account with a password, and back on', async () => {
    const who = await person()
    const call = await as(who)
    await db.user.update({ where: { id: who.id }, data: { googleLinkedAt: new Date() } })

    await expect(call.setGoogleSignIn({ enabled: false })).rejects.toThrow(/password first/u)

    await db.user.update({
      where: { id: who.id },
      data: { passwordHash: await hashPassword('A-long-enough-passphrase-1!') },
    })
    const off = await call.setGoogleSignIn({ enabled: false })
    expect(off.googleDisconnectedAt).toBeInstanceOf(Date)
    expect(off.googleLinkedAt).toBeNull()

    const on = await call.setGoogleSignIn({ enabled: true })
    expect(on.googleDisconnectedAt).toBeNull()
    // Nothing is linked until Google next signs the account in.
    expect(on.googleLinkedAt).toBeNull()
  })
})
