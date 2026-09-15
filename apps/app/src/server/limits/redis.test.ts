import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Redis limiter, against a stubbed Upstash.
 *
 * Decision 0017's whole objection to Redis was that "a limiter that has never
 * rejected a real request is not a limiter" — and this does not answer that.
 * There is still no Upstash account. What it does answer is the narrower
 * question a stub can: that the commands sent are the ones a sliding window
 * needs, in the order that makes it sliding, and that the replies are read the
 * way Upstash actually shapes them.
 *
 * The rest — that a real Redis behaves as documented — is not this file's to
 * claim, and the fallback in `index.ts` is what makes being wrong survivable.
 */

const URL_VALUE = 'https://example.upstash.io'

vi.mock('@/env', () => ({
  env: {
    UPSTASH_REDIS_REST_URL: URL_VALUE,
    UPSTASH_REDIS_REST_TOKEN: 'token',
  },
}))

const { consumeRedis, redisConfigured, usedRedis } = await import('./redis')

/** One reply per command, shaped the way Upstash shapes a pipeline answer. */
function reply(...results: unknown[]) {
  return {
    ok: true,
    json: () => Promise.resolve(results.map((result) => ({ result }))),
  } as Response
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** The commands of the nth pipeline call. */
function commandsOf(call: number): unknown[][] {
  const body = fetchMock.mock.calls[call]?.[1] as { body: string }
  return JSON.parse(body.body) as unknown[][]
}

describe('the Redis limiter (decision 0017, revisited)', () => {
  it('is only used when both variables are set', () => {
    expect(redisConfigured()).toBe(true)
  })

  it('drops what has fallen out of the window before counting what is left', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(0, 2, ['member', '1700000000000']))
      .mockResolvedValueOnce(reply(1, 1))

    await consumeRedis('suggestion:submit:u1', { limit: 10, windowMs: 60_000 })

    const [drop, count] = commandsOf(0)
    // This order is what makes the window slide rather than reset: counting
    // before dropping would include hits the window has already let go.
    expect(drop?.[0]).toBe('ZREMRANGEBYSCORE')
    expect(count?.[0]).toBe('ZCARD')
  })

  it('namespaces the key, so a shared Redis cannot collide', async () => {
    fetchMock.mockResolvedValueOnce(reply(0, 0, [])).mockResolvedValueOnce(reply(1, 1))

    await consumeRedis('idea:post:u1', { limit: 3, windowMs: 60_000 })

    expect(commandsOf(0)[0]?.[1]).toBe('storyboard:limit:idea:post:u1')
  })

  it('allows an action under the limit and records it with an expiry', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(0, 2, ['member', String(Date.now())]))
      .mockResolvedValueOnce(reply(1, 1))

    const verdict = await consumeRedis('k', { limit: 10, windowMs: 60_000 })

    expect(verdict.ok).toBe(true)
    expect(verdict.remaining).toBe(7)
    expect(verdict.retryAt).toBeNull()

    const [add, expire] = commandsOf(1)
    expect(add?.[0]).toBe('ZADD')
    // A key nobody touches again must not live for ever.
    expect(expire?.[0]).toBe('PEXPIRE')
  })

  it('gives each hit a unique member, or two in one millisecond become one', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(0, 0, []))
      .mockResolvedValueOnce(reply(1, 1))
      .mockResolvedValueOnce(reply(0, 1, ['m', String(Date.now())]))
      .mockResolvedValueOnce(reply(1, 1))

    await consumeRedis('k', { limit: 10, windowMs: 60_000 })
    await consumeRedis('k', { limit: 10, windowMs: 60_000 })

    const first = commandsOf(1)[0]?.[3]
    const second = commandsOf(3)[0]?.[3]
    expect(first).not.toBe(second)
  })

  it('refuses at the limit, and says when the window frees up', async () => {
    const oldest = Date.now() - 30_000
    fetchMock.mockResolvedValueOnce(reply(0, 10, ['member', String(oldest)]))

    const verdict = await consumeRedis('k', { limit: 10, windowMs: 60_000 })

    expect(verdict.ok).toBe(false)
    expect(verdict.remaining).toBe(0)
    expect(verdict.retryAt?.getTime()).toBe(oldest + 60_000)
    // Nothing is recorded when nothing was allowed: counting a refusal against
    // the limit is the bug the phase 6 audit found twice.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('throws rather than guessing when Upstash answers badly', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 })
    await expect(consumeRedis('k', { limit: 1, windowMs: 1000 })).rejects.toThrow('500')
  })

  it('throws when a single command in the pipeline is refused', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ result: 0 }, { error: 'WRONGTYPE' }]),
    })
    await expect(consumeRedis('k', { limit: 1, windowMs: 1000 })).rejects.toThrow('WRONGTYPE')
  })

  it('reads a count without recording anything', async () => {
    fetchMock.mockResolvedValueOnce(reply(0, 4))
    expect(await usedRedis('k', 60_000)).toBe(4)
    expect(commandsOf(0).some((command) => command[0] === 'ZADD')).toBe(false)
  })

  it('sends the token, and gives up rather than hanging', async () => {
    fetchMock.mockResolvedValueOnce(reply(0, 0, [])).mockResolvedValueOnce(reply(1, 1))
    await consumeRedis('k', { limit: 1, windowMs: 1000 })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${URL_VALUE}/pipeline`)
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer token')
    expect(init.signal).toBeDefined()
  })
})
