/**
 * FR-13.3 for sign-in, which had no limit at all until the phase 12 audit.
 *
 * Needs a real Postgres, so it skips when DATABASE_URL is unset. CI runs it.
 */
import { randomInt, randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { AUTH_LIMITS } from '@/lib/schemas/constants'

import { signInAllowed } from './sign-in-limit'

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('sign-in attempts (FR-13.3, phase 12 audit)', () => {
  let db: PrismaClient
  // A documentation range (RFC 5737), different on every run.
  const prefix = `198.51.100.${String(randomInt(1, 200))}`
  let clients = 0
  const aClient = () => `${prefix}:${String((clients += 1))}`
  const anAddress = () => `signin-${randomUUID().slice(0, 8)}@example.test`

  beforeAll(() => {
    db = createPrismaClient({ log: [] })
  })

  afterAll(async () => {
    await db.rateLimitHit.deleteMany({
      where: {
        OR: [
          { key: { startsWith: `auth:signin:${prefix}` } },
          { key: { startsWith: `auth:signin-from:${prefix}` } },
          { key: { startsWith: 'auth:signin:unknown:' } },
        ],
      },
    })
    await db.$disconnect()
  })

  it('stops guessing at one address from one client, and only there', async () => {
    const email = anAddress()
    const stranger = aClient()

    for (let attempt = 0; attempt < AUTH_LIMITS.signInsPerAddressAndClient; attempt += 1) {
      expect(await signInAllowed(db, email, stranger)).toBe(true)
    }
    expect(await signInAllowed(db, email, stranger)).toBe(false)

    // The owner, on their own device, is not locked out by the stranger.
    expect(await signInAllowed(db, email, aClient())).toBe(true)
  })

  it('stops one client working through a list of addresses', async () => {
    const script = aClient()

    for (let attempt = 0; attempt < AUTH_LIMITS.signInsPerClient; attempt += 1) {
      expect(await signInAllowed(db, anAddress(), script)).toBe(true)
    }
    expect(await signInAllowed(db, anAddress(), script)).toBe(false)
  })

  it('still counts per address when there is no client address to key on', async () => {
    const email = anAddress()
    for (let attempt = 0; attempt < AUTH_LIMITS.signInsPerAddressAndClient; attempt += 1) {
      expect(await signInAllowed(db, email, null)).toBe(true)
    }
    expect(await signInAllowed(db, email, null)).toBe(false)
  })
})
