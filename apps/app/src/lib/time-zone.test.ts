import { describe, expect, it } from 'vitest'

import {
  dayKeyInZone,
  formatInZone,
  TIME_ZONE_HEADER,
  timeZoneFromCookieHeader,
  timeZoneFromCookieValue,
  timeZoneFromHeaders,
  validTimeZone,
} from './time-zone'

/** Phase 14, item 1.18 — dates in the reader's own time zone. */
describe('time zones', () => {
  it('accepts a zone the engine knows, and nothing else', () => {
    expect(validTimeZone('Asia/Kolkata')).toBe('Asia/Kolkata')
    expect(validTimeZone('UTC')).toBe('UTC')
    // An alias browsers still report.
    expect(validTimeZone('Asia/Calcutta')).toBe('Asia/Calcutta')
    expect(validTimeZone('Mars/Olympus')).toBeNull()
    expect(validTimeZone('')).toBeNull()
    expect(validTimeZone(null)).toBeNull()
    expect(validTimeZone('x'.repeat(65))).toBeNull()
  })

  it('reads the cookie, encoded or not, and falls back to UTC', () => {
    expect(timeZoneFromCookieHeader('a=1; tz=Asia%2FKolkata; b=2')).toBe('Asia/Kolkata')
    expect(timeZoneFromCookieHeader('tz=Europe/London')).toBe('Europe/London')
    expect(timeZoneFromCookieHeader('tz=Nowhere/AtAll')).toBe('UTC')
    expect(timeZoneFromCookieHeader(null)).toBe('UTC')
    expect(timeZoneFromCookieValue('Pacific%2FAuckland')).toBe('Pacific/Auckland')
    expect(timeZoneFromCookieValue(undefined)).toBe('UTC')
  })

  it('writes a date near midnight on the day the reader has', () => {
    const late = new Date('2026-10-18T20:30:00Z')
    expect(formatInZone(late, 'long', 'UTC')).toBe('18 October 2026')
    expect(formatInZone(late, 'long', 'Asia/Kolkata')).toBe('19 October 2026')
    expect(formatInZone(late, 'short', 'Asia/Kolkata')).toBe('19 Oct 2026')
    expect(formatInZone(late, 'dayMonth', 'Asia/Kolkata')).toBe('19 October')
    expect(formatInZone(late, 'dayMonthShort', 'America/New_York')).toBe('18 Oct')
    expect(formatInZone(late, 'dateTime', 'Asia/Kolkata')).toMatch(/^19 October 2026.*02:00$/)
  })
})

/** Phase 14, item 6.13 — the day a thing was done, where its doer was. */
describe('days in a zone', () => {
  it('puts a late evening on the day the sender had, not the server', () => {
    const instant = new Date('2026-03-01T22:30:00Z')
    expect(dayKeyInZone(instant, 'UTC')).toBe('2026-03-01')
    expect(dayKeyInZone(instant, 'Asia/Kolkata')).toBe('2026-03-02')
    expect(dayKeyInZone(instant, 'America/Los_Angeles')).toBe('2026-03-01')
  })

  it('takes the zone a call sends, then the cookie, then the default', () => {
    expect(
      timeZoneFromHeaders(
        new Headers({ [TIME_ZONE_HEADER]: 'Asia/Kolkata', cookie: 'tz=Europe/Paris' }),
      ),
    ).toBe('Asia/Kolkata')
    expect(
      timeZoneFromHeaders(
        new Headers({ [TIME_ZONE_HEADER]: 'Mars/Olympus', cookie: 'tz=Europe/Paris' }),
      ),
    ).toBe('Europe/Paris')
    expect(timeZoneFromHeaders(new Headers())).toBe('UTC')
  })
})
