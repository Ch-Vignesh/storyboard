/**
 * Sign-up never says whether an address has an account (FR-1.3), and the
 * person who owns the address still hears what happened.
 *
 * Both halves failed on production on 2026-10-15. An address with an account
 * was answered "sent" and sent nothing, so its owner waited for an email that
 * was never coming; and because a new address answers "cooldown" when asked
 * twice inside a minute while that one always said "sent", two requests told a
 * stranger which kind it was.
 *
 * Needs a real Postgres, so it skips when DATABASE_URL is unset. CI runs it.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Mail } from '@/server/mail/mailer'

const sent: Mail[] = []

vi.mock('@/server/mail/mailer', () => ({
  getMailer: () => ({
    send: async (mail: Mail) => {
      sent.push(mail)
    },
  }),
}))

// The context's session lookup; these procedures are all public.
vi.mock('@/auth', () => ({ auth: async () => null }))

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('signing up, whoever owns the address (FR-1.3)', () => {
  let db: PrismaClient
  let call: Awaited<ReturnType<typeof caller>>
  const addresses: string[] = []

  async function caller(prisma: PrismaClient) {
    const { createCallerFactory } = await import('../init')
    const { authRouter } = await import('./auth')
    return createCallerFactory(authRouter)({
      db: prisma,
      session: null,
      account: null,
      headers: new Headers(),
    })
  }

  function anAddress(label: string): string {
    const address = `auth-${label}-${randomUUID().slice(0, 8)}@example.test`
    addresses.push(address)
    return address
  }

  beforeAll(async () => {
    db = createPrismaClient({ log: [] })
    call = await caller(db)
  })

  beforeEach(() => {
    sent.length = 0
  })

  afterAll(async () => {
    const keys = addresses.flatMap((address) => [
      `auth:signup:${address}`,
      `auth:resend:${address}`,
      `auth:cooldown:${address}`,
      `auth:reset:${address}`,
      `auth:reset-cooldown:${address}`,
    ])
    await db.rateLimitHit.deleteMany({ where: { key: { in: keys } } })
    await db.emailVerificationToken.deleteMany({ where: { user: { email: { in: addresses } } } })
    await db.user.deleteMany({ where: { email: { in: addresses } } })
    await db.$disconnect()
  })

  it('sends a new address its link, and answers "cooldown" to a second request inside the minute', async () => {
    const address = anAddress('new')

    expect(await call.signUp({ email: address })).toEqual({ status: 'sent' })
    expect(await call.signUp({ email: address })).toEqual({ status: 'cooldown' })

    expect(sent).toHaveLength(1)
    expect(sent[0]?.subject).toBe('Confirm your email for Draftboard')
    expect(sent[0]?.text).toMatch(/\/verify\?token=/u)
  })

  it('sends an address with an account a note instead, and answers in exactly the same rhythm', async () => {
    const address = anAddress('existing')
    await db.user.create({ data: { email: address, emailVerifiedAt: new Date() } })

    expect(await call.signUp({ email: address })).toEqual({ status: 'sent' })
    expect(await call.signUp({ email: address })).toEqual({ status: 'cooldown' })

    expect(sent).toHaveLength(1)
    expect(sent[0]?.to).toBe(address)
    expect(sent[0]?.subject).toBe('You already have a Draftboard account')
    expect(sent[0]?.text).toMatch(/\/signin$/mu)
    // A note about the account, never a way into it.
    expect(sent[0]?.text).not.toMatch(/token=/u)
    expect(await db.emailVerificationToken.count({ where: { user: { email: address } } })).toBe(0)
  })

  it('answers a resend for an address nobody has signed up with in the same rhythm, and sends nothing', async () => {
    const address = anAddress('nobody')

    expect(await call.resendVerification({ email: address })).toEqual({ status: 'sent' })
    expect(await call.resendVerification({ email: address })).toEqual({ status: 'cooldown' })

    expect(sent).toHaveLength(0)
    expect(await db.user.count({ where: { email: address } })).toBe(0)
  })

  it('answers a resend for an address with an account with the note, not a link', async () => {
    const address = anAddress('resend-existing')
    await db.user.create({ data: { email: address, emailVerifiedAt: new Date() } })

    expect(await call.resendVerification({ email: address })).toEqual({ status: 'sent' })
    expect(sent.map((mail) => mail.subject)).toEqual(['You already have a Draftboard account'])
  })

  // ── FR-1.7: a forgotten password ───────────────────────────────────────────

  async function aWriterWithAPassword(label: string, password = 'the original password') {
    const { hashPassword } = await import('@/auth/password')
    const email = anAddress(label)
    const user = await db.user.create({
      data: { email, emailVerifiedAt: new Date(), passwordHash: await hashPassword(password) },
      select: { id: true },
    })
    return { email, id: user.id }
  }

  /** The token out of the last reset email, as the person would click it. */
  function tokenFromResetMail(): string {
    const mail = sent.findLast((each) => each.subject === 'Reset your Draftboard password')
    const token = mail?.text.match(/\/reset-password\?token=([\w-]+)/u)?.[1]
    if (!token) throw new Error('No reset link was sent.')
    return token
  }

  it('sends an account a reset link, and answers in the one-minute rhythm', async () => {
    const { email } = await aWriterWithAPassword('reset-asks')

    expect(await call.requestPasswordReset({ email })).toEqual({ status: 'sent' })
    expect(await call.requestPasswordReset({ email })).toEqual({ status: 'cooldown' })

    expect(sent.map((mail) => mail.subject)).toEqual(['Reset your Draftboard password'])
    expect(sent[0]?.to).toBe(email)
    expect(await db.passwordResetToken.count({ where: { user: { email } } })).toBe(1)
  })

  it('answers an address with no account exactly the same, and sends nothing', async () => {
    const email = anAddress('reset-nobody')

    expect(await call.requestPasswordReset({ email })).toEqual({ status: 'sent' })
    expect(await call.requestPasswordReset({ email })).toEqual({ status: 'cooldown' })
    expect(sent).toHaveLength(0)
  })

  it('sends an address that never finished signing up its confirmation link instead', async () => {
    const email = anAddress('reset-unverified')
    await db.user.create({ data: { email } })

    expect(await call.requestPasswordReset({ email })).toEqual({ status: 'sent' })
    expect(sent.map((mail) => mail.subject)).toEqual(['Confirm your email for Draftboard'])
  })

  it('resets the password once, closes every other link, ends earlier sessions, and says so', async () => {
    const { verifyPassword } = await import('@/auth/password')
    const { email, id } = await aWriterWithAPassword('reset-does')
    await call.requestPasswordReset({ email })
    const first = tokenFromResetMail()
    // A second link, as if they asked twice a few minutes apart.
    await db.rateLimitHit.deleteMany({ where: { key: `auth:reset-cooldown:${email}` } })
    await call.requestPasswordReset({ email })
    const second = tokenFromResetMail()
    expect(second).not.toBe(first)

    const before = Date.now()
    expect(await call.checkPasswordReset({ token: second })).toEqual({ email })
    await call.resetPassword({
      token: second,
      password: 'a brand new passphrase',
      confirm: 'a brand new passphrase',
    })

    const user = await db.user.findUniqueOrThrow({ where: { id } })
    expect(await verifyPassword(String(user.passwordHash), 'a brand new passphrase')).toBe(true)
    expect(await verifyPassword(String(user.passwordHash), 'the original password')).toBe(false)
    expect(user.passwordChangedAt?.getTime()).toBeGreaterThanOrEqual(before)
    expect(await db.passwordResetToken.count({ where: { userId: id, consumedAt: null } })).toBe(0)
    expect(sent.at(-1)?.subject).toBe('Your Draftboard password was changed')

    // Used, and the other one closed with it.
    await expect(call.checkPasswordReset({ token: second })).rejects.toThrow(/expired/u)
    await expect(
      call.resetPassword({
        token: first,
        password: 'one more attempt',
        confirm: 'one more attempt',
      }),
    ).rejects.toThrow(/expired/u)
  })

  it('refuses an expired link, and two passwords that do not match', async () => {
    const { email, id } = await aWriterWithAPassword('reset-refuses')
    await call.requestPasswordReset({ email })
    const token = tokenFromResetMail()

    await expect(
      call.resetPassword({
        token,
        password: 'a brand new passphrase',
        confirm: 'a different one!!',
      }),
    ).rejects.toThrow(/do not match/u)

    await db.passwordResetToken.updateMany({
      where: { userId: id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    await expect(call.checkPasswordReset({ token })).rejects.toThrow(/expired/u)
    const user = await db.user.findUniqueOrThrow({ where: { id } })
    expect(user.passwordChangedAt).toBeNull()
  })

  it('changes the password once per link, even for a request that saw it unused a moment before', async () => {
    // Two requests can both pass the first look at a link before either has
    // changed anything, and nothing makes that happen on demand in a test. So
    // this goes straight to the step that decides: the second claim of the same
    // link must lose, whatever the request before it saw.
    const { applyPasswordReset } = await import('./auth')
    const { hashPassword, verifyPassword } = await import('@/auth/password')
    const { email, id } = await aWriterWithAPassword('reset-twice')
    await call.requestPasswordReset({ email })
    const record = await db.passwordResetToken.findFirstOrThrow({
      where: { userId: id },
      include: { user: { select: { id: true, emailVerifiedAt: true } } },
    })

    const now = new Date()
    expect(
      await applyPasswordReset(db, record, await hashPassword('the first one wins'), now),
    ).toBe(true)
    expect(
      await applyPasswordReset(db, record, await hashPassword('the second one loses'), now),
    ).toBe(false)

    const user = await db.user.findUniqueOrThrow({ where: { id } })
    expect(await verifyPassword(String(user.passwordHash), 'the first one wins')).toBe(true)
  })
})
