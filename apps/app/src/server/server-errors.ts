import { createHash } from 'node:crypto'

import type { Prisma, PrismaClient } from '@storyboard/db'

import { logger } from '@/lib/logger'
import { SERVER_ERRORS } from '@/lib/schemas/constants'

/**
 * Phase 14, item 10.1 (NFR-7, D-10) — a fault that no code handled, kept.
 *
 * Until this item the server's errors went to stdout, the host kept them for a
 * few days, and nothing told anybody. Now each place a fault surfaces writes a
 * row: Next's `onRequestError` (pages, route handlers, server actions, the
 * proxy), the tRPC route's `onError` (every procedure) and the cron route. The
 * hourly job emails the administrators about each new kind
 * (`server-error-alerts.ts`), and the admin panel's Errors screen lists them.
 *
 * What a row keeps is decided here, and it is deliberately little: where (the
 * procedure, the job, or the route as written, never an address with values
 * in it), the error's name, the first and last lines of its message with
 * addresses taken out and long quotations elided, and the top of its stack.
 * Never the request, its body or its headers, and never who was asking: a
 * library's message can carry what somebody wrote (Prisma prints the
 * arguments of a failed call between those two lines), and none of that
 * belongs in a record kept for a month.
 *
 * No `server-only` guard, like `mail/digests.ts`: `instrumentation.ts` reaches
 * this, and so does `pnpm cron`. Nothing here is importable from a client
 * component anyway: it writes to the database.
 */

type Db = PrismaClient | Prisma.TransactionClient

/** Where a fault surfaced: the tRPC route, the cron route, or one of Next's own. */
export type ErrorSource = 'trpc' | 'cron' | 'render' | 'route' | 'action' | 'proxy'

export type ServerErrorRecord = {
  fingerprint: string
  source: ErrorSource
  location: string
  name: string
  message: string
  stack: string | null
}

const log = logger.child({ module: 'server-errors' })

const MINUTE_MS = 60 * 1000
const DAY_MS = 24 * 60 * MINUTE_MS

/** An email address, wherever a library put one. */
const ADDRESS = /[^\s@<>()[\]"'`,;:]+@[^\s@<>()[\]"'`,;:]+\.[a-z]{2,}/giu

/**
 * A quotation long enough to be somebody's words rather than a name: V8 quotes
 * the input it could not parse as JSON, and Postgres the value it could not
 * cast. Backticks are left alone, because libraries put identifiers in them
 * (`prisma.user.create()`), and so is an apostrophe inside a word.
 */
const LONG_QUOTATION = /(^|[\s(:=,[{])(["'])[^"'\n]{24,}\2/gu

/** Any quotation, for the fingerprint: the same fault with other values is the same kind. */
const ANY_QUOTATION = /(["'])[^"'\n]*\1/gu

/** Ids, hashes and numbers, for the fingerprint. */
const VALUES = /\b[0-9a-f]{8,}\b|\bc[a-z0-9]{20,}\b|\d+/giu

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

/** The first and last lines of a message, with what could be somebody's words taken out. */
export function scrubMessage(message: string): string {
  const lines = message
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  const first = lines[0] ?? ''
  const last = lines.at(-1) ?? ''
  const kept = lines.length > 1 && last !== first ? `${first} … ${last}` : first
  return clip(
    kept.replace(ADDRESS, '[address]').replace(LONG_QUOTATION, '$1$2…$2'),
    SERVER_ERRORS.messageMaxChars,
  )
}

/** The top frames of a stack, one to a line: code, never data. */
export function topFrames(stack: string | undefined): string | null {
  if (!stack) return null
  const frames = stack
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('at '))
    .slice(0, SERVER_ERRORS.stackFrames)
  return frames.length > 0 ? clip(frames.join('\n'), SERVER_ERRORS.stackMaxChars) : null
}

/** The error's class, with its code when it has a short one (`P2002`, `ECONNREFUSED`). */
function errorName(error: unknown): string {
  if (!(error instanceof Error)) return `A thrown ${typeof error}`
  const code =
    'code' in error && typeof error.code === 'string' && /^[\w.-]{1,24}$/u.test(error.code)
      ? ` ${error.code}`
      : ''
  return clip(`${error.name}${code}`, SERVER_ERRORS.nameMaxChars)
}

/**
 * The same fault, whatever values it was thrown with, wherever it is thrown
 * from the same place: a hash of where, the error's name, and its message with
 * every quotation, id and number taken out.
 */
export function fingerprintOf(record: Omit<ServerErrorRecord, 'fingerprint' | 'stack'>): string {
  const shape = record.message.replace(ANY_QUOTATION, '$1…$1').replace(VALUES, '#')
  return createHash('sha256')
    .update([record.source, record.location, record.name, shape].join('\n'))
    .digest('hex')
    .slice(0, SERVER_ERRORS.fingerprintChars)
}

/** What a fault leaves behind, and nothing else. */
export function describeServerError(
  where: { source: ErrorSource; location: string },
  error: unknown,
): ServerErrorRecord {
  const partial = {
    source: where.source,
    location: clip(where.location.trim() || 'unknown', SERVER_ERRORS.locationMaxChars),
    name: errorName(error),
    message: scrubMessage(error instanceof Error ? error.message : String(error)),
  }
  return {
    ...partial,
    fingerprint: fingerprintOf(partial),
    stack: error instanceof Error ? topFrames(error.stack) : null,
  }
}

/**
 * One instance's count of the rows it wrote lately, per kind. A fault in a
 * loop (a broken page a crawler keeps asking for) would otherwise write a row
 * a request, and the table would be the next thing to fail. Past the limit
 * the host's logs still have every one.
 */
const lately = new Map<string, { since: number; count: number }>()

function tooMany(fingerprint: string, now: number): boolean {
  const entry = lately.get(fingerprint)
  if (entry && now - entry.since < MINUTE_MS) {
    entry.count += 1
    return entry.count > SERVER_ERRORS.perKindPerMinute
  }
  if (!entry && lately.size >= SERVER_ERRORS.kindsCounted) lately.clear()
  lately.set(fingerprint, { since: now, count: 1 })
  return false
}

/**
 * Keeps one fault. Never throws: it runs where something has already failed,
 * and a second failure here must not replace the first or reach the person.
 * If the row cannot be written, the reason is logged and that is all.
 */
export async function recordServerError(
  db: Db,
  where: { source: ErrorSource; location: string },
  error: unknown,
  now: Date = new Date(),
): Promise<void> {
  try {
    const record = describeServerError(where, error)
    if (tooMany(record.fingerprint, now.getTime())) return
    await db.serverError.create({ data: { ...record, createdAt: now } })
  } catch (failure) {
    log.error(
      {
        event: 'server_error.not_kept',
        source: where.source,
        location: where.location,
        error: failure instanceof Error ? failure.message : String(failure),
      },
      'a server error could not be written down',
    )
  }
}

/** Rows older than `SERVER_ERRORS.retentionDays` go, from the daily prune. */
export async function pruneServerErrors(
  db: PrismaClient,
  now: Date = new Date(),
): Promise<{ deleted: number }> {
  const before = new Date(now.getTime() - SERVER_ERRORS.retentionDays * DAY_MS)
  const { count } = await db.serverError.deleteMany({ where: { createdAt: { lt: before } } })
  log.info({ event: 'prune.serverErrors', deleted: count }, 'old server errors dropped')
  return { deleted: count }
}

export type ServerErrorKind = {
  fingerprint: string
  source: string
  location: string
  name: string
  /** As the newest occurrence had it. */
  message: string
  stack: string | null
  count: number
  firstSeen: Date
  lastSeen: Date
  /** Whether the administrators have been emailed about this kind. */
  announced: boolean
}

/**
 * The Errors screen: one entry per kind, the most recent first, with how often
 * and since when, and the newest occurrence's message and stack. `total` is
 * every kind the table holds, so the screen can say how many it is not showing.
 */
export async function serverErrorKinds(
  db: Db,
  limit: number = SERVER_ERRORS.pageKinds,
): Promise<{ kinds: ServerErrorKind[]; total: number }> {
  const groups = await db.serverError.groupBy({
    by: ['fingerprint'],
    _count: { _all: true },
    _min: { createdAt: true },
    _max: { createdAt: true, alertedAt: true },
    orderBy: { _max: { createdAt: 'desc' } },
    take: limit,
  })
  const [newest, [counted]] = await Promise.all([
    db.serverError.findMany({
      where: { fingerprint: { in: groups.map((group) => group.fingerprint) } },
      orderBy: { createdAt: 'desc' },
      distinct: ['fingerprint'],
      select: {
        fingerprint: true,
        source: true,
        location: true,
        name: true,
        message: true,
        stack: true,
      },
    }),
    db.$queryRaw<Array<{ total: number }>>`
      SELECT COUNT(DISTINCT "fingerprint")::int AS "total" FROM "ServerError"`,
  ])
  const byFingerprint = new Map(newest.map((row) => [row.fingerprint, row]))

  const kinds = groups.flatMap((group) => {
    const row = byFingerprint.get(group.fingerprint)
    if (!row || !group._min.createdAt || !group._max.createdAt) return []
    return [
      {
        ...row,
        count: group._count._all,
        firstSeen: group._min.createdAt,
        lastSeen: group._max.createdAt,
        announced: group._max.alertedAt !== null,
      },
    ]
  })
  return { kinds, total: counted?.total ?? kinds.length }
}
