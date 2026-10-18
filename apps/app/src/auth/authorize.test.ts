/**
 * Decision 0018 (phase 14, item 1.15) — a suspended person is told so, but
 * only after a correct password. `authorize` answered null for a suspended
 * account before checking the password, so they read "do not match", reset
 * the password, and read it again.
 *
 * Needs a real Postgres, so it skips when DATABASE_URL is unset. CI runs it.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// `next-auth` reaches for `next/server` on import, which this runner cannot
// resolve from inside that package. The one thing `authorize.ts` takes from
// it is the error class whose `code` reaches the sign-in page.
vi.mock('next-auth', () => ({
  CredentialsSignin: class CredentialsSignin extends Error {
    code = 'credentials'
  },
}))

import { authorizeCredentials } from './authorize'
import { hashPassword } from './password'

const databaseUrl = process.env.DATABASE_URL
const PASSWORD = 'A-long-enough-passphrase-1!'

describe.skipIf(!databaseUrl)('signing in with a password (FR-1.6)', () => {
  let db: PrismaClient
  const people: string[] = []

  async function account(status: 'ACTIVE' | 'SUSPENDED') {
    const run = randomUUID().replaceAll('-', '').slice(0, 8)
    const row = await db.user.create({
      data: {
        email: `az-${run}@example.test`,
        username: `az-${run}`,
        emailVerifiedAt: new Date(),
        passwordHash: await hashPassword(PASSWORD),
        status,
      },
      select: { id: true, email: true },
    })
    people.push(row.id)
    return row
  }

  const attempt = (email: string, password: string) =>
    authorizeCredentials(db, { email, password }, new Headers())

  beforeAll(() => {
    db = createPrismaClient({ log: [] })
  })

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { in: people } } })
    await db.$disconnect()
  })

  it('signs an active account in with the right password, and not with a wrong one', async () => {
    const who = await account('ACTIVE')
    expect(await attempt(who.email, PASSWORD)).toMatchObject({ id: who.id })
    expect(await attempt(who.email, 'not it at all')).toBeNull()
  })

  it('tells a suspended account so after the right password, and nothing after a wrong one', async () => {
    const who = await account('SUSPENDED')
    await expect(attempt(who.email, PASSWORD)).rejects.toMatchObject({ code: 'suspended' })
    expect(await attempt(who.email, 'not it at all')).toBeNull()
  })

  it('says nothing about an address it has never seen', async () => {
    expect(await attempt(`nobody-${randomUUID()}@example.test`, PASSWORD)).toBeNull()
  })
})
