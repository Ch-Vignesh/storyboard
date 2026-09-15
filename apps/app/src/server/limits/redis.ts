import 'server-only'

import { env } from '@/env'

import type { Limit, Verdict } from './types'

/**
 * The Redis half of FR-13.3's rate limiter (decision 0017's revisit).
 *
 * Decision 0017 chose Postgres and said the interface here is the one a Redis
 * driver would implement, so moving would be one file. This is that file, and
 * the claim held: `consume(key, limit)` in, `Verdict` out, and nothing above it
 * knows which store answered.
 *
 * **Upstash over HTTP, with no client library.** Their REST API is a POST with
 * a JSON array of arguments, which is a few lines of `fetch` — against a
 * dependency that would need to be kept current, audited, and bundled into a
 * serverless function for the sake of formatting the same request. There is no
 * connection to pool, which is the property that makes it worth using from
 * serverless at all.
 *
 * **The window is a sorted set.** Each hit is a member scored by its timestamp;
 * old scores are dropped, the rest are counted. That is a genuinely sliding
 * window, the same as the Postgres implementation, and for the same reason: a
 * fixed window lets somebody send ten at 23:59 and ten more at 00:01.
 *
 * Still not the default. Decision 0017's revisit trigger is a limit check
 * showing up in a slow query log, and until something is deployed there is no
 * slow query log. This runs when the two variables are set and not otherwise.
 */

export function redisConfigured(): boolean {
  return Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN)
}

type Command = Array<string | number>

/** Upstash answers a pipeline with one `{result}` or `{error}` per command. */
type PipelineReply = { result?: unknown; error?: string }

async function pipeline(commands: Command[]): Promise<unknown[]> {
  const response = await fetch(`${String(env.UPSTASH_REDIS_REST_URL)}/pipeline`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${String(env.UPSTASH_REDIS_REST_TOKEN)}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(commands),
    // A limiter that waits is worse than one that is briefly unavailable.
    signal: AbortSignal.timeout(2_000),
  })

  if (!response.ok) {
    throw new Error(`Upstash answered ${String(response.status)}`)
  }

  const replies = (await response.json()) as PipelineReply[]
  const failed = replies.find((reply) => reply.error)
  if (failed) throw new Error(`Upstash refused a command: ${String(failed.error)}`)
  return replies.map((reply) => reply.result)
}

/** Namespaced, so a Redis shared with anything else cannot collide. */
function redisKey(key: string): string {
  return `storyboard:limit:${key}`
}

export async function consumeRedis(key: string, { limit, windowMs }: Limit): Promise<Verdict> {
  const now = Date.now()
  const cutoff = now - windowMs
  const full = redisKey(key)

  const [, count, oldest] = await pipeline([
    // Everything that has fallen out of the window.
    ['ZREMRANGEBYSCORE', full, 0, cutoff],
    ['ZCARD', full],
    // The oldest survivor, for the "try again at" the refusal needs.
    ['ZRANGE', full, 0, 0, 'WITHSCORES'],
  ])

  const used = typeof count === 'number' ? count : 0

  if (used >= limit) {
    // ZRANGE ... WITHSCORES answers [member, score]; the score is the timestamp.
    const score = Array.isArray(oldest) ? Number(oldest[1]) : Number.NaN
    return {
      ok: false,
      remaining: 0,
      retryAt: Number.isFinite(score) ? new Date(score + windowMs) : null,
    }
  }

  await pipeline([
    // The member must be unique or two hits in the same millisecond collapse
    // into one and the window silently under-counts.
    ['ZADD', full, now, `${String(now)}-${Math.random().toString(36).slice(2, 10)}`],
    // So a key nobody touches again does not live forever.
    ['PEXPIRE', full, windowMs],
  ])

  return { ok: true, remaining: limit - used - 1, retryAt: null }
}

export async function usedRedis(key: string, windowMs: number): Promise<number> {
  const full = redisKey(key)
  const [, count] = await pipeline([
    ['ZREMRANGEBYSCORE', full, 0, Date.now() - windowMs],
    ['ZCARD', full],
  ])
  return typeof count === 'number' ? count : 0
}
