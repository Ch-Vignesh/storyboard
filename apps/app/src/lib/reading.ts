import { READING_COOKIE_DAYS, READING_LINE_HEIGHT, READING_TYPE_SCALE } from './schemas/constants'

/**
 * NFR-5 (phase 14, item 7.5) — the reader's type size and line height, as a
 * cookie the server reads, so every page that sets a manuscript is drawn at
 * the reader's setting from its first byte: the reader, the editor, the
 * composer and the comparisons alike, for a guest as much as anyone. The
 * setting used to be applied by an effect after load, on the reader only, so
 * the text jumped and every other page ignored it.
 *
 * A signed-in reader's saved setting is still the record (decision 0009); the
 * cookie is this device's copy of it, and a guest's only one.
 */

export const READING_COOKIE = 'reading'

export type Reading = { typeScale: number; lineHeight: number }

export const DEFAULT_READING: Reading = {
  typeScale: READING_TYPE_SCALE.default,
  lineHeight: READING_LINE_HEIGHT.default,
}

const within = (value: number, bounds: { min: number; max: number }) =>
  Number.isInteger(value) && value >= bounds.min && value <= bounds.max

/** "110-175" → the setting; anything else, or out of range, is the default. */
export function parseReading(value: string | null | undefined): Reading {
  const match = /^(\d{2,3})-(\d{2,3})$/u.exec(value ?? '')
  if (!match) return DEFAULT_READING
  const typeScale = Number(match[1])
  const lineHeight = Number(match[2])
  return {
    typeScale: within(typeScale, READING_TYPE_SCALE) ? typeScale : DEFAULT_READING.typeScale,
    lineHeight: within(lineHeight, READING_LINE_HEIGHT) ? lineHeight : DEFAULT_READING.lineHeight,
  }
}

export function readingCookieValue(reading: Reading): string {
  return `${String(reading.typeScale)}-${String(reading.lineHeight)}`
}

/** The two custom properties `.manuscript` reads (globals.css). */
export function readingVariables(reading: Reading): Record<string, string> {
  return {
    '--reading-type-scale': String(reading.typeScale / 100),
    '--reading-line-height': String(reading.lineHeight / 100),
  }
}

/** In the browser: this page at once, and the next one from the server. */
export function applyReading(reading: Reading): void {
  const root = document.documentElement
  for (const [name, value] of Object.entries(readingVariables(reading))) {
    root.style.setProperty(name, value)
  }
  const secure = location.protocol === 'https:' ? '; secure' : ''
  const maxAge = READING_COOKIE_DAYS * 24 * 60 * 60
  document.cookie = `${READING_COOKIE}=${readingCookieValue(reading)}; path=/; max-age=${String(maxAge)}; samesite=lax${secure}`
}
