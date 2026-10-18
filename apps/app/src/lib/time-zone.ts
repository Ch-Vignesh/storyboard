/**
 * Phase 14, item 1.18 — dates in the reader's own time zone.
 *
 * Server components used to format dates in the server's zone, which is UTC on
 * the host, so "the draft you left on 18 October" was a day out for anyone
 * east of Greenwich in the evening. The browser says which zone it is in: a
 * `tz` cookie set on arrival (`components/time-zone-cookie.tsx`), which server
 * components read through `lib/dates.ts`, and an `x-time-zone` header on every
 * tRPC call, which item 6.13 uses for activity days. Both are validated here
 * before anything formats with them. No `server-only` guard: the client sets
 * the cookie and the history panel formats with the zone it is handed.
 */

export const TIME_ZONE_COOKIE = 'tz'
export const TIME_ZONE_HEADER = 'x-time-zone'
export const DEFAULT_TIME_ZONE = 'UTC'

/** A zone the engine knows, or null. Tried rather than looked up in a list: browsers still report aliases. */
export function validTimeZone(value: string | null | undefined): string | null {
  if (!value || value.length > 64) return null
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: value })
    return value
  } catch {
    return null
  }
}

function decoded(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** The zone the `tz` cookie names in a Cookie header, or the default. */
export function timeZoneFromCookieHeader(header: string | null | undefined): string {
  const pair = header
    ?.split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${TIME_ZONE_COOKIE}=`))
  const raw = pair?.slice(TIME_ZONE_COOKIE.length + 1)
  return validTimeZone(raw === undefined ? undefined : decoded(raw)) ?? DEFAULT_TIME_ZONE
}

/** The zone a cookie value names (as `next/headers` hands it back), or the default. */
export function timeZoneFromCookieValue(value: string | undefined): string {
  return validTimeZone(value === undefined ? undefined : decoded(value)) ?? DEFAULT_TIME_ZONE
}

/**
 * The zone a request is in: the header a tRPC call carries, else the cookie a
 * page load carries, else the default (item 6.13).
 */
export function timeZoneFromHeaders(headers: Headers): string {
  return (
    validTimeZone(headers.get(TIME_ZONE_HEADER)) ?? timeZoneFromCookieHeader(headers.get('cookie'))
  )
}

/** The calendar day an instant falls in, in a zone, as `YYYY-MM-DD` (item 6.13). */
export function dayKeyInZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

/** The ways the interface writes a date. One place, so the pages agree. */
export type DateStyle = 'long' | 'short' | 'dayMonth' | 'dayMonthShort' | 'dateTime' | 'shortTime'

const STYLES: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  /** 18 October 2026 */
  long: { day: 'numeric', month: 'long', year: 'numeric' },
  /** 18 Oct 2026 */
  short: { day: 'numeric', month: 'short', year: 'numeric' },
  /** 18 October */
  dayMonth: { day: 'numeric', month: 'long' },
  /** 18 Oct */
  dayMonthShort: { day: 'numeric', month: 'short' },
  /** 18 October 2026, 14:05 */
  dateTime: { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' },
  /** 18 Oct, 14:05 */
  shortTime: { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' },
}

export function formatInZone(date: Date, style: DateStyle, timeZone: string): string {
  return date.toLocaleString('en-GB', { ...STYLES[style], timeZone })
}
