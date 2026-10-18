/**
 * Phase 14, item 3.2 — changing the email address. A link to the new address,
 * the same answer whatever the address, one use, a conflict caught at the
 * moment of confirming, every session ended, and the old address told.
 *
 * Needs a real Postgres, so it skips when DATABASE_URL is unset. CI runs it.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { sessionRefused } from '@/auth/config'
import { hashPassword } from '@/auth/password'
import { RECENT_SIGN_IN_MINUTES } from '@/lib/schemas/constants'
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

describe.skipIf(!databaseUrl)('changing the email address (item 3.2)', () => {
  let db: PrismaClient
  const people: string[] = []
  const run = randomUUID().replaceAll('-', '').slice(0, 8)

  async function person(label: string, password: string | null = 'Old password 1!') {
    const username = `em-${label}-${run}`
    const row = await db.user.create({
      data: {
        email: `${username}@example.test`,
        username,
        emailVerifiedAt: new Date(),
        passwordHash: password ? await hashPassword(password) : null,
      },
      select: { id: true, email: true },
    })
    people.push(row.id)
    return { id: row.id, email: row.email, username }
  }

  /** A caller for a person; `authAt` says when their session signed in. */
  async function as(who: { id: string; username: string }, authAt?: number) {
    const { createCallerFactory } = await import('../init')
    const { appRouter } = await import('./_app')
    return createCallerFactory(appRouter)({
      db,
      session: {
        user: { id: who.id, username: who.username, onboarded: true },
        expires: '',
        ...(authAt === undefined ? {} : { authAt }),
      },
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

  const linkToken = (to: string) =>
    sent.findLast((mail) => mail.to === to)?.text.match(/token=([\w-]+)/u)?.[1] ?? ''

  beforeAll(() => {
    db = createPrismaClient({ log: [] })
  })

  beforeEach(() => {
    sent.length = 0
  })

  afterAll(async () => {
    await db.emailChangeToken.deleteMany({ where: { userId: { in: people } } })
    await db.user.deleteMany({ where: { id: { in: people } } })
    await db.$disconnect()
  })

  it('sends a link to the new address, changes it once, ends every session and tells the old address', async () => {
    const who = await person('mover')
    const newEmail = `em-moved-${run}@example.test`
    const call = await as(who)

    await expect(
      call.settings.requestEmailChange({ newEmail, currentPassword: 'wrong' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      call.settings.requestEmailChange({ newEmail: who.email, currentPassword: 'Old password 1!' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

    const asked = await call.settings.requestEmailChange({
      newEmail,
      currentPassword: 'Old password 1!',
    })
    expect(asked).toEqual({ status: 'sent', to: newEmail })
    expect(sent.map((mail) => mail.to)).toEqual([newEmail])
    expect(sent[0]?.text).toContain('/settings/email?token=')
    const token = linkToken(newEmail)

    const { createCallerFactory } = await import('../init')
    const { appRouter } = await import('./_app')
    const guest = createCallerFactory(appRouter)({
      db,
      session: null,
      account: null,
      headers: new Headers(),
    })
    expect(await guest.auth.checkEmailChange({ token })).toEqual({ newEmail })

    const before = Date.now() - 60_000
    expect(await guest.auth.confirmEmailChange({ token })).toEqual({ email: newEmail })
    const row = await db.user.findUniqueOrThrow({ where: { id: who.id } })
    expect(row.email).toBe(newEmail)
    expect(row.emailVerifiedAt).not.toBeNull()
    expect(sessionRefused(before, row)).toBe(true)
    // The old address hears, with the new one shown in part.
    const notice = sent.find((mail) => mail.to === who.email)
    expect(notice?.text).toContain(`e…@example.test`)
    expect(notice?.text).toMatch(/signed out/u)

    // One use.
    await expect(guest.auth.confirmEmailChange({ token })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect(guest.auth.checkEmailChange({ token })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('answers the same for an address another account has, and sends nothing', async () => {
    const who = await person('quiet')
    const other = await person('other')
    const asked = await (
      await as(who)
    ).settings.requestEmailChange({ newEmail: other.email, currentPassword: 'Old password 1!' })
    expect(asked).toEqual({ status: 'sent', to: other.email })
    expect(sent).toEqual([])
    expect(await db.emailChangeToken.count({ where: { userId: who.id } })).toBe(0)
  })

  it('refuses at confirmation an address taken since the link was sent', async () => {
    const who = await person('late')
    const newEmail = `em-contested-${run}@example.test`
    await (
      await as(who)
    ).settings.requestEmailChange({ newEmail, currentPassword: 'Old password 1!' })
    const token = linkToken(newEmail)
    const squatter = await db.user.create({
      data: { email: newEmail, username: `em-squat-${run}`, emailVerifiedAt: new Date() },
      select: { id: true },
    })
    people.push(squatter.id)

    const { createCallerFactory } = await import('../init')
    const { appRouter } = await import('./_app')
    const guest = createCallerFactory(appRouter)({
      db,
      session: null,
      account: null,
      headers: new Headers(),
    })
    await expect(guest.auth.confirmEmailChange({ token })).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    expect((await db.user.findUniqueOrThrow({ where: { id: who.id } })).email).toBe(who.email)
  })

  it('asks a Google-only account for a recent sign-in instead of a password', async () => {
    const who = await person('google', null)
    const newEmail = `em-google-new-${run}@example.test`
    await expect((await as(who)).settings.requestEmailChange({ newEmail })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: expect.stringMatching(/Sign in again/u),
    })
    const stale = Date.now() - (RECENT_SIGN_IN_MINUTES + 1) * 60 * 1000
    await expect(
      (await as(who, stale)).settings.requestEmailChange({ newEmail }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    const asked = await (
      await as(who, Date.now() - 30_000)
    ).settings.requestEmailChange({
      newEmail,
    })
    expect(asked.status).toBe('sent')
    expect(sent.map((mail) => mail.to)).toEqual([newEmail])
  })
})
