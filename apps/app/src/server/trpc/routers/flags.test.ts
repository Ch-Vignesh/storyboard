/**
 * FR-15.5 with D-18 (phase 14, item 9.4) — each kill switch, thrown, refuses
 * its own way in, in plain words, before anything is counted, sent, uploaded
 * or copied; and the admin screen switches the known switches and no others.
 *
 * The switches are thrown in a stand-in for `isOn`, never in the database:
 * they are global, and the suites that share the database run side by side,
 * so a real switch thrown here would pause sign-ups for all of them.
 *
 * The refusals run against a database that throws when touched, which is how
 * "before anything happens" is shown; turning the switch off again lets the
 * same call through to that database. Only the Google case needs a real one
 * (it looks the address up first), so only it skips without DATABASE_URL.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import * as flags from '@/lib/flags'
import { FEATURE_FLAG_DESCRIPTIONS, FEATURE_FLAG_KEYS } from '@/lib/schemas/constants'

const { PAUSED } = flags
const paused = new Set<string>()

vi.mock('@/lib/flags', async (importOriginal) => {
  const real = await importOriginal<typeof flags>()
  return { ...real, isOn: vi.fn(async (key: string) => paused.has(key)) }
})

vi.mock('@/auth', () => ({ auth: async () => null }))

afterEach(() => paused.clear())

/** A database that must not be reached: any use of it fails the call, by name. */
const untouchable = new Proxy(
  {},
  {
    get(_target, property) {
      if (typeof property === 'symbol' || property === 'then') return undefined
      throw new Error(`reached the database (${property})`)
    },
  },
) as never

type Context = Parameters<Awaited<ReturnType<typeof callerFactory>>>[0]

async function callerFactory() {
  const { createCallerFactory } = await import('../init')
  const { appRouter } = await import('./_app')
  return createCallerFactory(appRouter)
}

async function call(ctx: Context) {
  return (await callerFactory())(ctx)
}

const writer = {
  session: { user: { id: 'writer-id', username: 'a-writer', onboarded: true }, expires: '' },
  account: {
    status: 'ACTIVE' as const,
    isAdmin: false,
    role: 'USER' as const,
    grants: [],
    deletionRequestedAt: null,
    username: 'a-writer',
  },
  headers: new Headers(),
}

describe('a thrown switch refuses, in plain words, before anything happens', () => {
  it('pause-sign-ups refuses a sign-up', async () => {
    const guest = await call({
      db: untouchable,
      session: null,
      account: null,
      headers: new Headers(),
    })
    paused.add('pause-sign-ups')
    await expect(guest.auth.signUp({ email: 'someone@example.test' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: PAUSED['pause-sign-ups'],
    })

    // Off again, the same sign-up goes on to the database.
    paused.clear()
    await expect(guest.auth.signUp({ email: 'someone@example.test' })).rejects.toThrow(
      /reached the database/u,
    )
  })

  it('pause-imports refuses to start an import', async () => {
    const someone = await call({ db: untouchable, ...writer })
    paused.add('pause-imports')
    await expect(
      someone.import.createUpload({ fileName: 'novel.docx', byteSize: 1_000 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', message: PAUSED['pause-imports'] })

    paused.clear()
    await expect(
      someone.import.createUpload({ fileName: 'novel.docx', byteSize: 1_000 }),
    ).rejects.toThrow(/reached the database/u)
  })

  it('pause-spin-offs refuses a spin-off, whatever the story', async () => {
    const someone = await call({ db: untouchable, ...writer })
    paused.add('pause-spin-offs')
    await expect(someone.spinOff.create({ storyboardId: 'any-story' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: PAUSED['pause-spin-offs'],
    })

    paused.clear()
    await expect(someone.spinOff.create({ storyboardId: 'any-story' })).rejects.toThrow(
      /reached the database/u,
    )
  })

  it('each switch pauses only its own way in', async () => {
    const someone = await call({ db: untouchable, ...writer })
    paused.add('pause-sign-ups')
    paused.add('pause-imports')
    await expect(someone.spinOff.create({ storyboardId: 'any-story' })).rejects.toThrow(
      /reached the database/u,
    )
  })
})

describe('the admin screen switches the known switches only', () => {
  const theAdmin = {
    session: { user: { id: 'admin-id', username: 'the-admin', onboarded: true }, expires: '' },
    account: {
      status: 'ACTIVE' as const,
      isAdmin: true,
      role: 'ADMIN' as const,
      grants: [],
      deletionRequestedAt: null,
      username: 'the-admin',
    },
    headers: new Headers(),
  }

  it('lists the three, off unless a row says otherwise, and who threw one', async () => {
    const thrownAt = new Date('2026-10-24T09:00:00Z')
    const findMany = vi.fn(async () => [
      {
        key: 'pause-imports',
        enabled: true,
        updatedAt: thrownAt,
        updatedBy: { username: 'the-admin', displayName: null },
      },
      // Made by the seed: nobody threw it, so nobody is named.
      { key: 'pause-sign-ups', enabled: false, updatedAt: thrownAt, updatedBy: null },
    ])
    const admin = await call({ db: { featureFlag: { findMany } } as never, ...theAdmin })

    const flags = await admin.admin.flags()
    expect(flags.map((flag) => flag.key)).toEqual([...FEATURE_FLAG_KEYS])
    expect(flags.find((flag) => flag.key === 'pause-imports')).toMatchObject({
      enabled: true,
      changedBy: 'the-admin',
      changedAt: thrownAt,
      description: FEATURE_FLAG_DESCRIPTIONS['pause-imports'],
    })
    expect(flags.find((flag) => flag.key === 'pause-sign-ups')).toMatchObject({
      enabled: false,
      changedBy: null,
    })
    expect(flags.find((flag) => flag.key === 'pause-spin-offs')).toMatchObject({ enabled: false })
  })

  it('refuses a switch that is not on the list', async () => {
    const admin = await call({ db: untouchable, ...theAdmin })
    await expect(
      admin.admin.setFlag({ key: 'new-browse' as 'pause-imports', enabled: true }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('throws a known one with the list’s own words, and says who did', async () => {
    const upsert = vi.fn(async () => ({ key: 'pause-spin-offs', enabled: true }))
    const admin = await call({ db: { featureFlag: { upsert } } as never, ...theAdmin })

    await admin.admin.setFlag({ key: 'pause-spin-offs', enabled: true })
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'pause-spin-offs' },
        update: {
          enabled: true,
          description: FEATURE_FLAG_DESCRIPTIONS['pause-spin-offs'],
          updatedById: 'admin-id',
        },
      }),
    )
  })
})

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('pause-sign-ups and a Google sign-in', () => {
  let db: PrismaClient
  const made: string[] = []
  const address = (label: string) => `paused-${label}-${randomUUID().slice(0, 8)}@example.test`

  beforeAll(() => {
    db = createPrismaClient({ log: [] })
  })

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { in: made } } })
    await db.$disconnect()
  })

  it('refuses a first sign-in, which would make an account, and makes none', async () => {
    const { resolveGoogleUser } = await import('@/auth/google')
    const email = address('new')
    paused.add('pause-sign-ups')

    expect(await resolveGoogleUser({ email, email_verified: true, name: 'New Person' })).toEqual({
      ok: false,
      reason: 'paused',
    })
    expect(await db.user.findUnique({ where: { email } })).toBeNull()
  })

  it('lets somebody who already has an account sign in as usual', async () => {
    const { resolveGoogleUser } = await import('@/auth/google')
    const email = address('existing')
    const existing = await db.user.create({
      data: { email, emailVerifiedAt: new Date() },
      select: { id: true },
    })
    made.push(existing.id)
    paused.add('pause-sign-ups')

    const outcome = await resolveGoogleUser({ email, email_verified: true, name: 'Old Hand' })
    expect(outcome).toMatchObject({ ok: true, userId: existing.id })
  })
})
