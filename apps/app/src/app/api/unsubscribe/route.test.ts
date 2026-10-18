/**
 * FR-12.1 (phase 14, item 2.4) — one-click unsubscribe. POST with a good token
 * turns the email off; GET changes nothing; a changed token changes nothing.
 *
 * Needs a real Postgres, so it skips when DATABASE_URL is unset. CI runs it.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { NextRequest } from 'next/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const SECRET = 'a-test-secret-of-at-least-thirty-two-chars'

vi.mock('@/env', () => ({
  env: {
    AUTH_SECRET: 'a-test-secret-of-at-least-thirty-two-chars',
    NEXT_PUBLIC_APP_URL: 'http://t',
  },
}))

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('POST /api/unsubscribe (one click)', () => {
  let db: PrismaClient
  const people: string[] = []

  async function person() {
    const run = randomUUID().replaceAll('-', '').slice(0, 8)
    const row = await db.user.create({
      data: { email: `un-${run}@example.test`, username: `un-${run}`, emailVerifiedAt: new Date() },
      select: { id: true },
    })
    people.push(row.id)
    return row.id
  }

  const emailOn = async (userId: string, type: string) =>
    (
      await db.notificationPreference.findFirst({
        where: { userId, type: type as never },
        select: { email: true },
      })
    )?.email ?? true

  beforeAll(() => {
    db = createPrismaClient({ log: [] })
  })

  afterAll(async () => {
    await db.notificationPreference.deleteMany({ where: { userId: { in: people } } })
    await db.user.deleteMany({ where: { id: { in: people } } })
    await db.$disconnect()
  })

  it('turns the named kinds of email off, and only those, and answers 200', async () => {
    const { signUnsubscribe } = await import('@/server/mail/unsubscribe')
    const { POST } = await import('./route')
    const userId = await person()
    const token = signUnsubscribe(
      { userId, types: ['SUGGESTION_RECEIVED', 'WEEKLY_DIGEST'] },
      SECRET,
    )

    const response = await POST(
      new NextRequest(`http://t/api/unsubscribe?t=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click',
      }),
    )
    expect(response.status).toBe(200)
    expect(await emailOn(userId, 'SUGGESTION_RECEIVED')).toBe(false)
    expect(await emailOn(userId, 'WEEKLY_DIGEST')).toBe(false)
    expect(await emailOn(userId, 'IDEA_RECEIVED')).toBe(true)
  })

  it('changes nothing on GET, or for a token that was changed', async () => {
    const { signUnsubscribe } = await import('@/server/mail/unsubscribe')
    const { GET, POST } = await import('./route')
    const userId = await person()
    const token = signUnsubscribe({ userId, types: 'all' }, SECRET)

    const shown = GET(new NextRequest(`http://t/api/unsubscribe?t=${encodeURIComponent(token)}`))
    expect(shown.status).toBe(303)
    expect(shown.headers.get('location')).toContain('/unsubscribe?t=')
    expect(await emailOn(userId, 'SUGGESTION_RECEIVED')).toBe(true)

    const refused = await POST(
      new NextRequest(`http://t/api/unsubscribe?t=${encodeURIComponent(`${token}x`)}`, {
        method: 'POST',
      }),
    )
    expect(refused.status).toBe(400)
    expect(await emailOn(userId, 'SUGGESTION_RECEIVED')).toBe(true)
  })

  it('comes back to the page when the page pressed the button', async () => {
    const { signUnsubscribe } = await import('@/server/mail/unsubscribe')
    const { POST } = await import('./route')
    const userId = await person()
    const token = signUnsubscribe({ userId, types: ['IDEA_RECEIVED'] }, SECRET)
    const response = await POST(
      new NextRequest(`http://t/api/unsubscribe?t=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'from=page',
      }),
    )
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toContain('done=1')
    expect(await emailOn(userId, 'IDEA_RECEIVED')).toBe(false)
  })
})
