import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  UNCONFIRMED_ACCOUNT_RETENTION_DAYS,
  USED_TOKEN_RETENTION_DAYS,
} from '@/lib/schemas/constants'

import { pruneDeadTokens, pruneUnconfirmedAccounts } from './prune'

const databaseUrl = process.env.DATABASE_URL
const DAY_MS = 24 * 60 * 60 * 1000
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS)
const daysAhead = (days: number) => new Date(Date.now() + days * DAY_MS)

/** Phase 14, item 3.12 — what the daily prune removes, and what it must leave. */
describe.skipIf(!databaseUrl)('the daily prune of what signing in leaves behind', () => {
  let db: PrismaClient
  const made: string[] = []

  async function user(data: {
    createdAt?: Date
    emailVerifiedAt?: Date | null
    passwordHash?: string | null
    username?: string | null
    status?: 'ACTIVE' | 'DELETED'
  }): Promise<string> {
    const row = await db.user.create({
      data: { email: `prune-${randomUUID().slice(0, 8)}@example.test`, ...data },
      select: { id: true },
    })
    made.push(row.id)
    return row.id
  }

  beforeAll(() => {
    db = createPrismaClient({ log: [] })
  })

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { in: made } } })
    await db.$disconnect()
  })

  it('drops links that were used or expired more than the retention ago, and keeps the rest', async () => {
    const owner = await user({ emailVerifiedAt: new Date() })
    const stale = USED_TOKEN_RETENTION_DAYS + 1
    const token = () => ({ userId: owner, tokenHash: randomUUID() })
    await db.emailVerificationToken.createMany({
      data: [
        // Dead long enough: gone.
        { ...token(), expiresAt: daysAgo(stale - 1), consumedAt: daysAgo(stale) },
        { ...token(), expiresAt: daysAgo(stale) },
        // Dead, but not for long: kept, so a late click still gets the right words.
        { ...token(), expiresAt: daysAhead(1), consumedAt: daysAgo(1) },
        { ...token(), expiresAt: daysAgo(1) },
        // Live: kept.
        { ...token(), expiresAt: daysAhead(1) },
      ],
    })
    await db.passwordResetToken.createMany({
      data: [
        { ...token(), expiresAt: daysAgo(stale) },
        { ...token(), expiresAt: daysAhead(1) },
      ],
    })
    await db.emailChangeToken.createMany({
      data: [
        { ...token(), newEmail: 'new@example.test', expiresAt: daysAgo(stale) },
        { ...token(), newEmail: 'new@example.test', expiresAt: daysAhead(1) },
      ],
    })

    await pruneDeadTokens(db)

    expect(await db.emailVerificationToken.count({ where: { userId: owner } })).toBe(3)
    expect(await db.passwordResetToken.count({ where: { userId: owner } })).toBe(1)
    expect(await db.emailChangeToken.count({ where: { userId: owner } })).toBe(1)
  })

  it('removes an address that never confirmed, once the retention is up, and nothing else', async () => {
    const stale = UNCONFIRMED_ACCOUNT_RETENTION_DAYS + 1
    const abandoned = await user({ createdAt: daysAgo(stale) })
    await db.emailVerificationToken.create({
      data: { userId: abandoned, tokenHash: randomUUID(), expiresAt: daysAgo(stale - 1) },
    })
    const recent = await user({ createdAt: daysAgo(1) })
    // Confirmed by Google, never set a password: an account, not a leftover.
    const google = await user({
      createdAt: daysAgo(stale * 2),
      emailVerifiedAt: daysAgo(stale * 2),
    })
    // Has a password but never confirmed — not a state sign-up can produce,
    // and exactly why the filter asks for every condition rather than one.
    const odd = await user({ createdAt: daysAgo(stale), passwordHash: 'not-a-real-hash' })
    // What an erasure leaves (decision 0024): no password, address or name,
    // and still not a sign-up to tidy away (2026-10-26 final pass).
    const erased = await user({ createdAt: daysAgo(stale * 3), status: 'DELETED' })
    // A picture is something (item 3.13), however the row got here.
    const pictured = await user({ createdAt: daysAgo(stale) })
    await db.userAvatar.create({
      data: { userId: pictured, bytes: Buffer.from('not really webp'), contentType: 'image/webp' },
    })

    await pruneUnconfirmedAccounts(db)

    const left = await db.user.findMany({
      where: { id: { in: [abandoned, recent, google, odd, erased, pictured] } },
      select: { id: true },
    })
    expect(left.map((row) => row.id).sort()).toEqual([recent, google, odd, erased, pictured].sort())
    // Its links went with it.
    expect(await db.emailVerificationToken.count({ where: { userId: abandoned } })).toBe(0)
  })
})
