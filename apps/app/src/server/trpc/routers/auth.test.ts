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
})
