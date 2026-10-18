import 'server-only'

import { cookies } from 'next/headers'

import {
  TIME_ZONE_COOKIE,
  formatInZone,
  timeZoneFromCookieValue,
  type DateStyle,
} from './time-zone'

/**
 * The reader's time zone, from the cookie the browser set on arrival (item
 * 1.18). UTC until it has: the first page a person ever sees, and anything a
 * crawler reads.
 */
export async function readTimeZone(): Promise<string> {
  const store = await cookies()
  return timeZoneFromCookieValue(store.get(TIME_ZONE_COOKIE)?.value)
}

/** A date in the reader's own zone, for a server component with one date to write. */
export async function formatDate(date: Date, style: DateStyle): Promise<string> {
  return formatInZone(date, style, await readTimeZone())
}
