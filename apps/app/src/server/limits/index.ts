import 'server-only'

import type { Prisma, PrismaClient } from '@storyboard/db'
import { TRPCError } from '@trpc/server'

import { logger } from '@/lib/logger'

import { consumeRedis, redisConfigured, usedRedis } from './redis'
import type { Limit, Verdict } from './types'

/**
 * FR-13.3 — the global rate limits, as a sliding window.
 *
 * Two stores behind one function. Postgres by default, which is what decision
 * 0017 chose and what has been enforcing these limits since phase 6; Redis when
 * the two Upstash variables are set, which is decision 0017's own revisit,
 * carried out in phase 9.
 *
 * Configuration decides, not `NODE_ENV` — the same reasoning as the storage
 * driver in `server/storage`. A deployment with no Redis is a supported way to
 * run this rather than a degraded one.
 *
 * The window is genuinely sliding in both: "ten in the last twenty-four hours",
 * not "ten since midnight". A fixed window lets somebody send ten at 23:59 and
 * ten more at 00:01, which is the failure mode the limit exists to prevent.
 */

const log = logger.child({ module: 'limits' })

type Db = PrismaClient | Prisma.TransactionClient

export const DAY_MS = 24 * 60 * 60 * 1000
export const HOUR_MS = 60 * 60 * 1000
export const MINUTE_MS = 60 * 1000

/** The longest window anything uses. Rows older than this are of no interest. */
export const LONGEST_WINDOW_MS = DAY_MS

export type { Limit, Verdict } from './types'

/**
 * Counts one action against a key, and records it if it is allowed.
 *
 * The count and the insert are not atomic, so two requests arriving together
 * can both see `limit - 1`. The worst case is one over the limit, which for
 * "ten suggestions a day" is not the kind of wrong that matters — and it is the
 * same behaviour a Redis sliding window gives, for the same reason.
 */
export async function consume(db: Db, key: string, limit: Limit): Promise<Verdict> {
  // Decision 0017's revisit (phase 9). Configuration chooses the store, not
  // `NODE_ENV` and not a build flag: a deployment with no Redis is a supported
  // way to run this, and the Postgres window is not a fallback but the thing
  // that has been enforcing these limits all along.
  if (redisConfigured()) {
    try {
      return await consumeRedis(key, limit)
    } catch (error) {
      // A limiter that is briefly unreachable must not take the product with
      // it. Falling back to Postgres keeps the limit enforced — not opening
      // the gate, which is the other obvious thing to do here and is wrong.
      log.error(
        { event: 'limits.redis_failed', error: String(error) },
        'the Redis limiter failed; falling back to Postgres for this request',
      )
    }
  }
  return consumePostgres(db, key, limit)
}

async function consumePostgres(db: Db, key: string, { limit, windowMs }: Limit): Promise<Verdict> {
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
  if (redisConfigured()) {
    try {
      return await usedRedis(key, windowMs)
    } catch {
      // This one only feeds "you have three left" in the interface, so a
      // wrong-but-plausible number beats an error page.
    }
  }
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
