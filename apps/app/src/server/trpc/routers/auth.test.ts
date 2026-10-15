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
import { randomInt, randomUUID } from 'node:crypto'

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
    const { key } = await import('@/server/limits')
    const keys = addresses.flatMap((address) => [
      key.signUp(address),
      key.verificationResend(address),
      key.addressCooldown(address),
      key.passwordReset(address),
      key.resetCooldown(address),
    ])
    await db.rateLimitHit.deleteMany({
      where: { OR: [{ key: { in: keys } }, { key: { startsWith: 'auth:mail-from:203.0.113.' } }] },
    })
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

  async function cooldownKey(address: string): Promise<string> {
    const { key } = await import('@/server/limits')
    return key.addressCooldown(address)
  }

  /**
   * Phase 12 audit. Each form kept its own one-minute rhythm, so asking two of
   * them in turn told a stranger which kind of address it was: nobody's
   * answered "sent", "sent"; an account's answered "sent", "cooldown".
   */
  it('answers every kind of address the same, whichever form asks first', async () => {
    const nobody = anAddress('turns-nobody')
    const someone = anAddress('turns-someone')
    const halfway = anAddress('turns-halfway')
    await db.user.create({ data: { email: someone, emailVerifiedAt: new Date() } })
    await db.user.create({ data: { email: halfway } })

    for (const address of [nobody, someone, halfway]) {
      expect(await call.resendVerification({ email: address })).toEqual({ status: 'sent' })
      expect(await call.signUp({ email: address })).toEqual({ status: 'cooldown' })
      // Reset links keep their own rhythm, the same for every kind of address.
      expect(await call.requestPasswordReset({ email: address })).toEqual({ status: 'sent' })
      expect(await call.requestPasswordReset({ email: address })).toEqual({ status: 'cooldown' })
    }
  })

  /**
   * Phase 12 audit. Every limit here was per address, so a script that typed a
   * new address each time could send without end, and Gmail stops at about
   * 500 a day: every real sign-up and reset with it.
   */
  it('stops one client asking for mail to address after address', async () => {
    const { AUTH_LIMITS } = await import('@/lib/schemas/constants')
    const { createCallerFactory } = await import('../init')
    const { authRouter } = await import('./auth')
    const { key } = await import('@/server/limits')
    // A documentation address (RFC 5737), new each run and cleared first, so a
    // run that was stopped before its cleanup cannot leave this one a day's
    // worth of mail already counted.
    const client = `203.0.113.${String(randomInt(1, 255))}`
    await db.rateLimitHit.deleteMany({ where: { key: key.authEmailsFrom(client) } })
    const fromOneClient = createCallerFactory(authRouter)({
      db,
      session: null,
      account: null,
      headers: new Headers({ 'x-forwarded-for': `${client}, 10.0.0.1` }),
    })

    for (let index = 0; index < AUTH_LIMITS.emailsPerClientPerDay; index += 1) {
      await fromOneClient.signUp({ email: anAddress(`flood-${String(index)}`) })
    }
    await expect(fromOneClient.signUp({ email: anAddress('flood-over') })).rejects.toThrow(
      /too many emails/iu,
    )
    // Somebody else, elsewhere, is not affected.
    expect(await call.signUp({ email: anAddress('flood-elsewhere') })).toEqual({ status: 'sent' })
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
    const { key } = await import('@/server/limits')
    await db.rateLimitHit.deleteMany({ where: { key: key.resetCooldown(email) } })
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

  /** The token out of the last confirmation email. */
  function tokenFromVerifyMail(): string {
    const mail = sent.findLast((each) => each.subject === 'Confirm your email for Draftboard')
    const token = mail?.text.match(/\/verify\?token=([\w-]+)/u)?.[1]
    if (!token) throw new Error('No confirmation link was sent.')
    return token
  }

  /**
   * Phase 12 audit. A confirmation link chooses the first password and never
   * changes one (decision 0036). An older link still sitting in the inbox used
   * to replace the password silently: no session ended, no notice sent.
   */
  it('lets a confirmation link choose the first password, and never change it', async () => {
    const { verifyPassword } = await import('@/auth/password')
    const { createVerificationToken } = await import('@/auth/tokens')
    const email = anAddress('first-password')
    await call.signUp({ email })
    const older = tokenFromVerifyMail()
    await db.rateLimitHit.deleteMany({ where: { key: await cooldownKey(email) } })
    await call.resendVerification({ email })
    const newer = tokenFromVerifyMail()
    expect(newer).not.toBe(older)

    await call.setPassword({ token: newer, password: 'the first passphrase' })

    // The older link closed with it.
    await expect(call.verifyEmail({ token: older })).rejects.toThrow(/expired/u)
    await expect(call.setPassword({ token: older, password: 'somebody else now' })).rejects.toThrow(
      /expired/u,
    )

    // And a link that somehow outlived it still cannot change the password.
    const user = await db.user.findUniqueOrThrow({ where: { email } })
    const stray = createVerificationToken()
    await db.emailVerificationToken.create({
      data: { userId: user.id, tokenHash: stray.tokenHash, expiresAt: stray.expiresAt },
    })
    expect(await call.verifyEmail({ token: stray.token })).toEqual({ email, hasPassword: true })
    await expect(
      call.setPassword({ token: stray.token, password: 'somebody else now' }),
    ).rejects.toThrow(/already has a password/u)

    const after = await db.user.findUniqueOrThrow({ where: { email } })
    expect(await verifyPassword(String(after.passwordHash), 'the first passphrase')).toBe(true)
  })

  it('lets only one of two submissions of the same confirmation link win', async () => {
    const email = anAddress('first-password-race')
    await call.signUp({ email })
    const token = tokenFromVerifyMail()

    const results = await Promise.allSettled([
      call.setPassword({ token, password: 'the first of the two' }),
      call.setPassword({ token, password: 'the second of the two' }),
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
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
