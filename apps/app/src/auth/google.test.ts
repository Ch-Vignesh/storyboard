/**
 * Signing in with Google (FR-1.6), and the one rule that is a security rule.
 *
 * Linking an OAuth identity to an existing account by email address is an
 * account-takeover vector whenever the provider has not checked that the person
 * owns the address. Google does check and says so in the token. So the rule
 * under test is narrow and load-bearing: **link only when Google asserts
 * `email_verified`, and refuse otherwise rather than quietly creating a second
 * account.**
 *
 * There is no Google project to test against and there does not need to be:
 * what is worth pinning is what this product does with a profile, not that
 * Google's OAuth works.
 *
 * Needs a real Postgres, so it skips when DATABASE_URL is unset. CI runs it.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { resolveGoogleUser } from './google'

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('resolving a Google sign-in', () => {
  let db: PrismaClient
  const made: string[] = []

  beforeAll(() => {
    db = createPrismaClient({ log: [] })
  })

  afterEach(async () => {
    if (made.length) await db.user.deleteMany({ where: { id: { in: made } } })
    made.length = 0
  })

  function address(label: string): string {
    return `google-${label}-${randomUUID().slice(0, 8)}@example.test`
  }

  async function track(email: string) {
    const row = await db.user.findUnique({ where: { email }, select: { id: true } })
    if (row) made.push(row.id)
    return row
  }

  it('refuses a profile Google has not verified', async () => {
    const email = address('unverified')
    const outcome = await resolveGoogleUser({ email, email_verified: false, name: 'Someone' })

    expect(outcome).toEqual({ ok: false, reason: 'unverified' })
    // And creates nothing: a refusal must not leave an account behind that a
    // later, verified sign-in would then link to.
    expect(await track(email)).toBeNull()
  })

  it('refuses a profile with no email at all', async () => {
    expect(await resolveGoogleUser({ email_verified: true })).toEqual({
      ok: false,
      reason: 'unverified',
    })
  })

  it('creates an account, verified, with no username', async () => {
    const email = address('new')
    const outcome = await resolveGoogleUser({ email, email_verified: true, name: 'Ada Lovelace' })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    made.push(outcome.userId)

    // No username: it is permanent and FR-1.3's own step. A Google display
    // name is not a username, and using one would hand somebody a public
    // identity they never chose.
    expect(outcome.username).toBeNull()
    expect(outcome.onboarded).toBe(false)

    const row = await db.user.findUniqueOrThrow({
      where: { id: outcome.userId },
      select: { emailVerifiedAt: true, displayName: true, passwordHash: true, rulesSeenAt: true },
    })
    // Google has already done what the verification email exists to do.
    expect(row.emailVerifiedAt).not.toBeNull()
    expect(row.displayName).toBe('Ada Lovelace')
    // No password, so the credentials provider refuses this account by the
    // check it already makes.
    expect(row.passwordHash).toBeNull()
    expect(row.rulesSeenAt).not.toBeNull()
  })

  it('links to the existing account rather than making a second one', async () => {
    const email = address('linked')
    const created = await db.user.create({
      data: { email, username: `g${randomUUID().slice(0, 8)}`, onboardedAt: new Date() },
      select: { id: true, username: true },
    })
    made.push(created.id)

    const outcome = await resolveGoogleUser({ email, email_verified: true, name: 'Ignored' })

    expect(outcome).toEqual({
      ok: true,
      userId: created.id,
      username: created.username,
      onboarded: true,
    })
    expect(await db.user.count({ where: { email } })).toBe(1)
  })

  it('lowercases the address, so one person is not two accounts', async () => {
    const email = address('case')
    const created = await db.user.create({ data: { email }, select: { id: true } })
    made.push(created.id)

    const outcome = await resolveGoogleUser({ email: email.toUpperCase(), email_verified: true })

    expect(outcome.ok && outcome.userId).toBe(created.id)
  })

  it('refuses a suspended account (FR-13.5)', async () => {
    const email = address('suspended')
    const created = await db.user.create({
      data: { email, status: 'SUSPENDED' },
      select: { id: true },
    })
    made.push(created.id)

    expect(await resolveGoogleUser({ email, email_verified: true })).toEqual({
      ok: false,
      reason: 'suspended',
    })
  })

  it('lets an account inside its deletion grace period in, so it can change its mind', async () => {
    // Decision 0024 — the undo is behind a sign-in, so refusing here would
    // make it unreachable by exactly the people who need it. `can()` and
    // `activeProcedure` stop them writing meanwhile.
    const email = address('leaving')
    const created = await db.user.create({
      data: { email, deletionRequestedAt: new Date() },
      select: { id: true },
    })
    made.push(created.id)

    const outcome = await resolveGoogleUser({ email, email_verified: true })
    expect(outcome.ok).toBe(true)
  })
})
