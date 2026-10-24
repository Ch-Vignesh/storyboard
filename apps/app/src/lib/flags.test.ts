import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SEEDED_FLAGS } from '../../../../packages/db/prisma/seed/flags'

import { forgetFlags, isOn, PAUSED } from './flags'
import {
  FEATURE_FLAG_DESCRIPTIONS,
  FEATURE_FLAG_KEYS,
  FLAG_CACHE_SECONDS,
} from './schemas/constants'

/**
 * FR-15.5 with D-18 (phase 14, item 9.4) — reading a kill switch.
 *
 * No database: the switches are global, and the suites that do use one run
 * side by side, so a test that threw a real switch would pause sign-ups for
 * every other suite running at that moment. A fake table stands in.
 */
function table(enabled: boolean | null) {
  const findUnique = vi.fn(async () => (enabled === null ? null : { enabled }))
  return { db: { featureFlag: { findUnique } } as never, findUnique }
}

describe('isOn', () => {
  beforeEach(() => forgetFlags())

  it('is off when the switch has no row: an unseeded deployment refuses nobody', async () => {
    expect(await isOn('pause-sign-ups', table(null).db)).toBe(false)
  })

  it('reads the row when there is one', async () => {
    expect(await isOn('pause-imports', table(true).db)).toBe(true)
    expect(await isOn('pause-spin-offs', table(false).db)).toBe(false)
  })

  it('keeps an answer for FLAG_CACHE_SECONDS, then reads again', async () => {
    const start = 1_000_000
    const { db, findUnique } = table(true)
    expect(await isOn('pause-sign-ups', db, start)).toBe(true)
    expect(await isOn('pause-sign-ups', db, start + FLAG_CACHE_SECONDS * 1000 - 1)).toBe(true)
    expect(findUnique).toHaveBeenCalledTimes(1)

    expect(await isOn('pause-sign-ups', db, start + FLAG_CACHE_SECONDS * 1000)).toBe(true)
    expect(findUnique).toHaveBeenCalledTimes(2)
  })

  it('reads again at once after the switch is forgotten, as the admin screen does', async () => {
    expect(await isOn('pause-imports', table(false).db)).toBe(false)
    // Still remembered as off, whatever the table now says...
    expect(await isOn('pause-imports', table(true).db)).toBe(false)
    // ...until this instance is told to forget it.
    forgetFlags('pause-imports')
    expect(await isOn('pause-imports', table(true).db)).toBe(true)
  })
})

describe('the known switches', () => {
  it('are exactly the three D-18 names', () => {
    expect([...FEATURE_FLAG_KEYS]).toEqual(['pause-sign-ups', 'pause-imports', 'pause-spin-offs'])
  })

  it('are the ones the seed creates, in the same words (packages/db/prisma/seed/flags.ts)', () => {
    expect(SEEDED_FLAGS).toEqual(
      FEATURE_FLAG_KEYS.map((key) => ({ key, description: FEATURE_FLAG_DESCRIPTIONS[key] })),
    )
  })

  it('each fit their column and say, when refused, what is paused', () => {
    for (const key of FEATURE_FLAG_KEYS) {
      expect(FEATURE_FLAG_DESCRIPTIONS[key].length).toBeLessThanOrEqual(300)
      expect(PAUSED[key]).toMatch(/paused|not taking/u)
      expect(PAUSED[key]).toMatch(/try again later/iu)
    }
  })
})
