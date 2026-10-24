import { describe, expect, it } from 'vitest'

import { READING_LINE_HEIGHT, READING_TYPE_SCALE } from '@/lib/schemas/constants'

import { DEFAULT_READING, parseReading, readingCookieValue, readingVariables } from './reading'

describe('the reading cookie (item 7.5)', () => {
  it('reads back what it writes', () => {
    const reading = { typeScale: 120, lineHeight: 189 }
    expect(parseReading(readingCookieValue(reading))).toEqual(reading)
  })

  it('falls back to the default for anything it did not write', () => {
    expect(parseReading(undefined)).toEqual(DEFAULT_READING)
    expect(parseReading('')).toEqual(DEFAULT_READING)
    expect(parseReading('big-tall')).toEqual(DEFAULT_READING)
    expect(parseReading('120;175')).toEqual(DEFAULT_READING)
  })

  it('keeps each value inside its bounds, one at a time', () => {
    const tooBig = READING_TYPE_SCALE.max + 5
    expect(parseReading(`${String(tooBig)}-175`)).toEqual({
      typeScale: READING_TYPE_SCALE.default,
      lineHeight: 175,
    })
    const tooTight = READING_LINE_HEIGHT.min - 10
    expect(parseReading(`110-${String(tooTight)}`)).toEqual({
      typeScale: 110,
      lineHeight: READING_LINE_HEIGHT.default,
    })
  })

  it('becomes the two custom properties the manuscript reads', () => {
    expect(readingVariables({ typeScale: 115, lineHeight: 175 })).toEqual({
      '--reading-type-scale': '1.15',
      '--reading-line-height': '1.75',
    })
  })
})
