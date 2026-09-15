import 'server-only'

import type { Prisma, PrismaClient } from '@storyboard/db'
import { TRPCError } from '@trpc/server'

import { logger } from '@/lib/logger'

/**
 * FR-13.3 — the global rate limits, as a sliding window over Postgres.
 *
 * Decision 0017 records why this is not Redis. The short version: there is no
 * Upstash account to test against, and a limiter that has never rejected a real
 * request is not a limiter. The interface here is the one a Redis driver would
 * implement, so moving is one file when there is something to move to.
 *
 * The window is genuinely sliding: "ten in the last twenty-four hours", not
 * "ten since midnight". A fixed window lets somebody send ten at 23:59 and ten
 * more at 00:01, which is the failure mode the limit exists to prevent.
 */

const log = logger.child({ module: 'limits' })

type Db = PrismaClient | Prisma.TransactionClient

export const DAY_MS = 24 * 60 * 60 * 1000
export const HOUR_MS = 60 * 60 * 1000
export const MINUTE_MS = 60 * 1000

/** The longest window anything uses. Rows older than this are of no interest. */
export const LONGEST_WINDOW_MS = DAY_MS

export type Limit = {
  /** How many are allowed inside the window. */
  limit: number
  /** How long the window is, in milliseconds. */
  windowMs: number
}

export type Verdict = {
  ok: boolean
  /** How many remain after this one. Zero when refused. */
  remaining: number
  /** When the oldest hit in the window falls out of it, if refused. */
  retryAt: Date | null
}

/**
 * Counts one action against a key, and records it if it is allowed.
 *
 * The count and the insert are not atomic, so two requests arriving together
 * can both see `limit - 1`. The worst case is one over the limit, which for
 * "ten suggestions a day" is not the kind of wrong that matters — and it is the
 * same behaviour a Redis sliding window gives, for the same reason.
 */
export async function consume(db: Db, key: string, { limit, windowMs }: Limit): Promise<Verdict> {
  const since = new Date(Date.now() - windowMs)

  const hits = await db.rateLimitHit.findMany({
    where: { key, at: { gte: since } },
    orderBy: { at: 'asc' },
    select: { at: true },
    take: limit,
  })

  if (hits.length >= limit) {
    const oldest = hits[0]?.at
    return {
      ok: false,
      remaining: 0,
      retryAt: oldest ? new Date(oldest.getTime() + windowMs) : null,
    }
  }

  await db.rateLimitHit.create({ data: { key } })
  return { ok: true, remaining: limit - hits.length - 1, retryAt: null }
}

/** Reads the count without recording anything. For showing somebody where they are. */
export async function used(db: Db, key: string, windowMs: number): Promise<number> {
  return db.rateLimitHit.count({ where: { key, at: { gte: new Date(Date.now() - windowMs) } } })
}

/**
 * `consume`, throwing the error the API should return.
 *
 * The message says when to come back rather than only that the door is shut:
 * "try again tomorrow" is information, "rate limited" is not.
 */
export async function enforce(
  db: Db,
  key: string,
  limit: Limit,
  message: (retryAt: Date | null) => string,
): Promise<void> {
  const verdict = await consume(db, key, limit)
  if (verdict.ok) return

  log.info({ event: 'limit.refused', key }, 'rate limit refused an action')
  throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: message(verdict.retryAt) })
}

/** "in about four hours", "tomorrow" — a sentence fragment, not a timestamp. */
export function whenToRetry(retryAt: Date | null): string {
  if (!retryAt) return 'in a while'
  const ms = retryAt.getTime() - Date.now()
  if (ms <= 0) return 'now'
  if (ms < HOUR_MS) return `in ${String(Math.max(1, Math.round(ms / MINUTE_MS)))} minutes`
  if (ms < 6 * HOUR_MS) return `in about ${String(Math.round(ms / HOUR_MS))} hours`
  return 'tomorrow'
}

/**
 * Drops rows that have fallen out of every window. Run by the cron runner
 * (decision 0012); the table would otherwise grow for ever holding facts
 * nothing can ask about any more.
 */
export async function pruneRateLimits(db: PrismaClient): Promise<{ deleted: number }> {
  const { count } = await db.rateLimitHit.deleteMany({
    where: { at: { lt: new Date(Date.now() - LONGEST_WINDOW_MS) } },
  })
  log.info({ event: 'limit.pruned', deleted: count }, 'old rate limit rows dropped')
  return { deleted: count }
}

/** Key shapes, in one place so a typo cannot silently create a second bucket. */
export const key = {
  suggestionsSent: (userId: string) => `suggestion:submit:${userId}`,
  ideasPosted: (userId: string) => `idea:post:${userId}`,
  storyboardsCreated: (userId: string) => `storyboard:create:${userId}`,
  importsStarted: (userId: string) => `import:create:${userId}`,
  spinOff: (userId: string, storyboardId: string) => `spinoff:${storyboardId}:${userId}`,
  reportsMade: (userId: string) => `report:create:${userId}`,
  // FR-1.4's surfaces have no signed-in person to key on, so they key on the
  // address being used. An address is not an identity, but it is what the
  // action is about, and it is what somebody abusing it has to keep changing.
  signUp: (email: string) => `auth:signup:${email.toLowerCase()}`,
  verificationResend: (email: string) => `auth:resend:${email.toLowerCase()}`,
} as const
