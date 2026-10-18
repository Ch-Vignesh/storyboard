/**
 * Phase 14, item 3.13 (D-5) — the profile-picture upload and the route that
 * serves it. Needs a real Postgres, so it skips when DATABASE_URL is unset.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { AVATAR } from '@/lib/schemas/constants'

type Session = {
  user: { id: string; username: string | null; onboarded: boolean }
  expires: string
}

const state = vi.hoisted(() => ({ session: null as Session | null }))
vi.mock('@/auth', () => ({ auth: async () => state.session }))

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('POST /api/avatar and GET /u/[username]/avatar', () => {
  let db: PrismaClient
  const people: string[] = []

  async function person(status: 'ACTIVE' | 'SUSPENDED' = 'ACTIVE') {
    const run = randomUUID().replaceAll('-', '').slice(0, 8)
    const row = await db.user.create({
      data: {
        email: `av-${run}@example.test`,
        username: `av-${run}`,
        emailVerifiedAt: new Date(),
        onboardedAt: new Date(),
        status,
      },
      select: { id: true, username: true },
    })
    people.push(row.id)
    state.session = {
      user: { id: row.id, username: row.username, onboarded: true },
      expires: '',
    }
    return { id: row.id, username: row.username ?? '' }
  }

  function upload(file: File | null): Request {
    const body = new FormData()
    if (file) body.set('picture', file)
    return new Request('http://t/api/avatar', { method: 'POST', body })
  }

  async function post(file: File | null) {
    const { POST } = await import('./route')
    return POST(upload(file))
  }

  async function serve(username: string) {
    const { GET } = await import('../../u/[username]/avatar/route')
    return GET(new Request(`http://t/u/${username}/avatar`), {
      params: Promise.resolve({ username }),
    })
  }

  async function aPhoto(): Promise<File> {
    const bytes = await sharp({
      create: { width: 1600, height: 1200, channels: 3, background: { r: 30, g: 90, b: 160 } },
    })
      .png()
      .toBuffer()
    return new File([new Uint8Array(bytes)], 'me.png', { type: 'image/png' })
  }

  beforeAll(() => {
    db = createPrismaClient({ log: [] })
  })

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { in: people } } })
    await db.$disconnect()
  })

  it('refuses a stranger before reading anything', async () => {
    state.session = null
    const response = await post(await aPhoto())
    expect(response.status).toBe(401)
  })

  it('refuses a file that is too big, one that is not a picture, and none at all', async () => {
    await person()
    expect((await post(null)).status).toBe(400)

    const huge = new File([new Uint8Array(AVATAR.maxUploadBytes + 1)], 'huge.png', {
      type: 'image/png',
    })
    expect((await post(huge)).status).toBe(413)

    const text = new File(['hello, not a picture'], 'me.png', { type: 'image/png' })
    const refused = await post(text)
    expect(refused.status).toBe(415)
    expect(((await refused.json()) as { error: string }).error).toMatch(/not a picture/u)
  })

  it('stores the icon form and serves it, cached for good under its version', async () => {
    const { id, username } = await person()

    const first = await post(await aPhoto())
    expect(first.status).toBe(200)
    const stored = await db.userAvatar.findUniqueOrThrow({ where: { userId: id } })
    expect(stored.contentType).toBe('image/webp')
    expect(stored.bytes.byteLength).toBeLessThanOrEqual(AVATAR.maxStoredBytes)
    const meta = await sharp(Buffer.from(stored.bytes)).metadata()
    expect([meta.width, meta.height]).toEqual([AVATAR.sizePx, AVATAR.sizePx])

    const served = await serve(username)
    expect(served.status).toBe(200)
    expect(served.headers.get('content-type')).toBe('image/webp')
    expect(served.headers.get('cache-control')).toContain('immutable')
    expect(served.headers.get('x-content-type-options')).toBe('nosniff')
    expect(Buffer.from(await served.arrayBuffer()).equals(Buffer.from(stored.bytes))).toBe(true)

    // Nobody of that name, or no picture: nothing, and nothing cached.
    const none = await serve(`${username}-nobody`)
    expect(none.status).toBe(404)
    expect(none.headers.get('cache-control')).toContain('no-store')
  })

  it('is refused by the same gate as every settings change: a suspended account', async () => {
    await person('SUSPENDED')
    const response = await post(await aPhoto())
    expect(response.status).toBe(403)
  })
})
