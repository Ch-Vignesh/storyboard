/**
 * Phase 14, item 10.1 (NFR-7, D-10) — server errors are kept, and someone
 * hears about them.
 *
 * The first block needs nothing: it pins what a row may keep, which is the
 * part that must never carry somebody's writing. The rest needs a real
 * Postgres with migrations applied, so it skips when DATABASE_URL is unset;
 * CI always has one. Those suites clear the `ServerError` table around each
 * test: it holds diagnostics only, nothing else writes it during a test run,
 * and the hourly alert reads the whole table by design.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { SERVER_ERRORS } from '@/lib/schemas/constants'
import type { Mail, Mailer } from '@/server/mail/mailer'

import { alertNewServerErrors } from './server-error-alerts'
import {
  describeServerError,
  pruneServerErrors,
  recordServerError,
  scrubMessage,
  serverErrorKinds,
  topFrames,
} from './server-errors'

let signedIn: { id: string; username: string } | null = null

vi.mock('@/auth', () => ({
  auth: async () =>
    signedIn
      ? { user: { id: signedIn.id, username: signedIn.username, onboarded: true }, expires: '' }
      : null,
}))

/** What Prisma's message looks like when a call fails: the arguments sit between the lines. */
const PRISMA_MESSAGE = [
  '',
  'Invalid `prisma.suggestion.create()` invocation:',
  '',
  '{',
  '  data: {',
  '    contentText: "The lamp turned the way it always had, and the clock did not",',
  '    reporter: "someone@example.test"',
  '  }',
  '}',
  '',
  'Unique constraint failed on the fields: (`publicId`)',
].join('\n')

class KnownRequestError extends Error {
  code = 'P2002'
  override name = 'PrismaClientKnownRequestError'
}

describe('what a server error keeps (item 10.1)', () => {
  it("keeps a message's first and last lines, never the arguments between them", () => {
    const kept = scrubMessage(PRISMA_MESSAGE)
    expect(kept).toBe(
      'Invalid `prisma.suggestion.create()` invocation: … Unique constraint failed on the fields: (`publicId`)',
    )
    expect(kept).not.toContain('lamp')
    expect(kept).not.toContain('example.test')
  })

  it('takes out addresses and long quotations, and keeps names', () => {
    expect(scrubMessage('Invalid recipient someone@example.test, refused')).toBe(
      'Invalid recipient [address], refused',
    )
    // V8 quotes the text it could not parse; that text is somebody's.
    expect(
      scrubMessage(
        'Unexpected token \'T\', "The lamp turned the way it always had" is not valid JSON',
      ),
    ).toBe('Unexpected token \'T\', "…" is not valid JSON')
    // Short quotations are names, and an apostrophe inside a word is not a quotation.
    expect(scrubMessage('relation "User" does not exist')).toBe('relation "User" does not exist')
    expect(
      scrubMessage("Can't reach database server at `db.example`, and it doesn't say why"),
    ).toBe("Can't reach database server at `db.example`, and it doesn't say why")
  })

  it('cuts a message to fit its column', () => {
    const kept = scrubMessage('x'.repeat(SERVER_ERRORS.messageMaxChars * 2))
    expect(kept).toHaveLength(SERVER_ERRORS.messageMaxChars)
    expect(kept.endsWith('…')).toBe(true)
  })

  it('keeps only the top frames of a stack', () => {
    const stack = [
      'Error: boom',
      ...Array.from(
        { length: SERVER_ERRORS.stackFrames + 4 },
        (_, index) => `    at frame${String(index)} (/app/x.js:1:${String(index)})`,
      ),
    ].join('\n')
    const frames = topFrames(stack)?.split('\n') ?? []
    expect(frames).toHaveLength(SERVER_ERRORS.stackFrames)
    expect(frames[0]).toBe('at frame0 (/app/x.js:1:0)')
    expect(topFrames(undefined)).toBeNull()
  })

  it('names the error with its code, and says what was thrown when it was not an Error', () => {
    const where = { source: 'trpc' as const, location: 'suggestion.accept' }
    const described = describeServerError(where, new KnownRequestError(PRISMA_MESSAGE))
    expect(described.name).toBe('PrismaClientKnownRequestError P2002')
    expect(described.stack).toContain('at ')

    const thrown = describeServerError(where, 'a string, thrown')
    expect(thrown.name).toBe('A thrown string')
    expect(thrown.message).toBe('a string, thrown')
    expect(thrown.stack).toBeNull()
  })

  it('gives the same fault one fingerprint whatever its values, and another place another', () => {
    const at = (location: string, message: string) =>
      describeServerError({ source: 'render', location }, new Error(message)).fingerprint
    const first = at('/s/[slug]', 'No row 41 for "cm1a2b3c4d5e6f7g8h9i0j1k2" in 12 ms')
    expect(at('/s/[slug]', 'No row 7 for "cm9z8y7x6w5v4u3t2s1r0q9p8" in 950 ms')).toBe(first)
    expect(at('/s/[slug]/versions', 'No row 41 for "cm1a2b3c4d5e6f7g8h9i0j1k2" in 12 ms')).not.toBe(
      first,
    )
    expect(first).toHaveLength(SERVER_ERRORS.fingerprintChars)
  })
})

const databaseUrl = process.env.DATABASE_URL

/** Collects what would have been sent, instead of sending it. */
function recordingMailer(): Mailer & { sent: Mail[] } {
  const sent: Mail[] = []
  return {
    sent,
    send(mail) {
      sent.push(mail)
      return Promise.resolve()
    },
  }
}

describe.skipIf(!databaseUrl)('keeping server errors (item 10.1)', () => {
  let db: PrismaClient
  const run = randomUUID().replaceAll('-', '').slice(0, 8)
  const people: string[] = []

  async function person(label: string, role: 'USER' | 'SUB_ADMIN', grants: string[] = []) {
    const username = `se-${label}-${run}`
    const row = await db.user.create({
      data: {
        email: `${username}@example.test`,
        username,
        role,
        emailVerifiedAt: new Date(),
        onboardedAt: new Date(),
      },
      select: { id: true },
    })
    people.push(row.id)
    // Granted by themselves: who granted it is not what is under test, and
    // the one admin this database may hold is not this suite's to take.
    for (const capability of grants) {
      await db.subAdminGrant.create({ data: { userId: row.id, capability, grantedById: row.id } })
    }
    return { id: row.id, username, email: `${username}@example.test` }
  }

  beforeAll(() => {
    db = createPrismaClient({ log: [] })
  })

  beforeEach(async () => {
    await db.serverError.deleteMany({})
  })

  afterAll(async () => {
    await db.serverError.deleteMany({})
    await db.subAdminGrant.deleteMany({ where: { userId: { in: people } } })
    await db.user.deleteMany({ where: { id: { in: people } } })
    await db.$disconnect()
  })

  it('writes where and what, and nothing of the request', async () => {
    await recordServerError(
      db,
      { source: 'trpc', location: 'suggestion.submit' },
      new KnownRequestError(PRISMA_MESSAGE),
    )
    const [row] = await db.serverError.findMany()
    expect(row).toMatchObject({
      source: 'trpc',
      location: 'suggestion.submit',
      name: 'PrismaClientKnownRequestError P2002',
      alertedAt: null,
    })
    expect(row?.message).not.toContain('lamp')
    expect(JSON.stringify(row)).not.toContain('example.test')
  })

  it('never throws when the row cannot be written', async () => {
    const broken = {
      serverError: { create: () => Promise.reject(new Error('connection refused')) },
    } as unknown as PrismaClient
    await expect(
      recordServerError(broken, { source: 'cron', location: 'hourly' }, new Error('boom')),
    ).resolves.toBeUndefined()
  })

  it('writes a fault in a loop a bounded number of times a minute', async () => {
    const where = { source: 'render' as const, location: `/loop-${run}` }
    const start = new Date('2031-03-04T09:00:00Z')
    for (let index = 0; index < SERVER_ERRORS.perKindPerMinute + 5; index += 1) {
      await recordServerError(db, where, new Error('the same fault'), start)
    }
    expect(await db.serverError.count({ where: { location: where.location } })).toBe(
      SERVER_ERRORS.perKindPerMinute,
    )
    // A minute on, it is written again.
    await recordServerError(
      db,
      where,
      new Error('the same fault'),
      new Date(start.getTime() + 61_000),
    )
    expect(await db.serverError.count({ where: { location: where.location } })).toBe(
      SERVER_ERRORS.perKindPerMinute + 1,
    )
  })

  it('is kept for its retention, then pruned', async () => {
    const now = new Date()
    const day = 24 * 60 * 60 * 1000
    const where = { source: 'route' as const, location: `/prune-${run}` }
    await recordServerError(
      db,
      where,
      new Error('old'),
      new Date(now.getTime() - (SERVER_ERRORS.retentionDays + 1) * day),
    )
    await recordServerError(
      db,
      where,
      new Error('recent'),
      new Date(now.getTime() - (SERVER_ERRORS.retentionDays - 1) * day),
    )
    await pruneServerErrors(db, now)
    const left = await db.serverError.findMany({ where: { location: where.location } })
    expect(left.map((row) => row.message)).toEqual(['recent'])
  })

  it('lists one entry per kind, the most recent first, with how often and since when', async () => {
    const early = new Date('2031-03-04T09:00:00Z')
    const later = new Date('2031-03-04T09:05:00Z')
    await recordServerError(db, { source: 'trpc', location: 'a.one' }, new Error('row 1'), early)
    await recordServerError(db, { source: 'trpc', location: 'a.one' }, new Error('row 2'), later)
    await recordServerError(db, { source: 'trpc', location: 'b.two' }, new Error('other'), early)

    const { kinds, total } = await serverErrorKinds(db)
    expect(total).toBe(2)
    expect(kinds.map((kind) => kind.location)).toEqual(['a.one', 'b.two'])
    expect(kinds[0]).toMatchObject({
      count: 2,
      firstSeen: early,
      lastSeen: later,
      message: 'row 2',
      announced: false,
    })
  })

  it("keeps Next's faults by the route as written, outside a request as inside one", async () => {
    const { keepRequestError } = await import('@/instrumentation-errors')
    await keepRequestError(new Error('render failed'), {
      routerKind: 'App Router',
      routePath: '/s/[slug]',
      routeType: 'render',
      revalidateReason: undefined,
    })
    const row = await db.serverError.findFirst({ where: { location: '/s/[slug]' } })
    expect(row).toMatchObject({ source: 'render', message: 'render failed' })
  })

  it('opens the Errors screen to whoever holds errors.read, and 404s everyone else', async () => {
    const reader = await person('reader', 'SUB_ADMIN', ['errors.read'])
    const other = await person('other', 'SUB_ADMIN', ['flags.toggle'])
    const user = await person('user', 'USER')
    const { createCallerFactory, createTRPCContext } = await import('./trpc/init')
    const { appRouter } = await import('./trpc/routers/_app')
    const as = async (who: { id: string; username: string } | null) => {
      signedIn = who
      return createCallerFactory(appRouter)(await createTRPCContext({ headers: new Headers() }))
    }

    await recordServerError(db, { source: 'trpc', location: 'c.three' }, new Error('seen'))
    await expect((await as(reader)).admin.errors()).resolves.toMatchObject({ total: 1 })
    for (const who of [other, user, null]) {
      await expect((await as(who)).admin.errors()).rejects.toMatchObject({ code: 'NOT_FOUND' })
    }
    signedIn = null
  })

  describe('the hourly email', () => {
    const mineIn = (mailer: { sent: Mail[] }, address: string) =>
      mailer.sent.filter((mail) => mail.to === address)

    it('tells whoever may read the log about a new kind, once, at most once an hour', async () => {
      const reader = await person('alert', 'SUB_ADMIN', ['errors.read'])
      const other = await person('noalert', 'SUB_ADMIN', ['reports.decide'])
      const at = (iso: string) => new Date(iso)

      for (const minute of ['10', '11', '12']) {
        await recordServerError(
          db,
          { source: 'trpc', location: 'first.kind' },
          new Error('it broke'),
          at(`2031-03-04T09:${minute}:00Z`),
        )
      }

      const first = recordingMailer()
      await alertNewServerErrors(db, at('2031-03-04T10:05:00Z'), { mailer: first })
      const [mail] = mineIn(first, reader.email)
      expect(mineIn(first, reader.email)).toHaveLength(1)
      expect(mineIn(first, other.email)).toHaveLength(0)
      expect(mail?.subject).toBe('Draftboard: a new kind of server error')
      expect(mail?.text).toContain('first.kind (trpc)')
      expect(mail?.text).toContain('Error: it broke')
      expect(mail?.text).toContain('3 times, first on 4 March 2031')
      expect(mail?.text).toContain('/admin/errors')
      expect(mail?.html).not.toContain('<img')
      expect(await db.serverError.count({ where: { alertedAt: null } })).toBe(0)

      // A new kind in the same hour waits for the next one.
      await recordServerError(
        db,
        { source: 'render', location: '/second/[kind]' },
        new Error('it broke again'),
        at('2031-03-04T10:15:00Z'),
      )
      // And the first kind, happening again, is not news.
      await recordServerError(
        db,
        { source: 'trpc', location: 'first.kind' },
        new Error('it broke'),
        at('2031-03-04T10:20:00Z'),
      )
      const sameHour = recordingMailer()
      expect(
        await alertNewServerErrors(db, at('2031-03-04T10:30:00Z'), { mailer: sameHour }),
      ).toEqual({ kinds: 0, sent: 0 })
      expect(sameHour.sent).toHaveLength(0)

      const nextHour = recordingMailer()
      await alertNewServerErrors(db, at('2031-03-04T11:02:00Z'), { mailer: nextHour })
      const [second] = mineIn(nextHour, reader.email)
      expect(second?.text).toContain('/second/[kind] (render)')
      expect(second?.text).not.toContain('first.kind')
    })

    it('stamps nothing when every send fails, so the next run tries again', async () => {
      const reader = await person('retry', 'SUB_ADMIN', ['errors.read'])
      await recordServerError(
        db,
        { source: 'cron', location: 'purge' },
        new Error('it broke'),
        new Date('2031-03-05T09:00:00Z'),
      )
      const refusing: Mailer = { send: () => Promise.reject(new Error('550 quota exceeded')) }
      const failed = await alertNewServerErrors(db, new Date('2031-03-05T10:00:00Z'), {
        mailer: refusing,
      })
      expect(failed.sent).toBe(0)
      expect(await db.serverError.count({ where: { alertedAt: null } })).toBe(1)

      const working = recordingMailer()
      await alertNewServerErrors(db, new Date('2031-03-05T10:10:00Z'), { mailer: working })
      expect(mineIn(working, reader.email)).toHaveLength(1)
    })
  })
})
