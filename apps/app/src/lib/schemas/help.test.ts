import { describe, expect, it } from 'vitest'

import {
  closesOn,
  createRequestSchema,
  suggestionStateLabel,
  waitsOnClosedRequest,
  WORD_BOUNDS_SENTENCE,
} from './help'

describe('a suggestion on a request closed without accepting (FR-5.10)', () => {
  it('reads as not accepted, whether it was waiting or needed updating', () => {
    expect(suggestionStateLabel('SUBMITTED', 'CLOSED')).toBe('not accepted')
    expect(suggestionStateLabel('STALE', 'CLOSED')).toBe('not accepted')
    expect(waitsOnClosedRequest('SUBMITTED', 'CLOSED')).toBe(true)
  })

  it('keeps every decided state as it was, and every state on an open request', () => {
    expect(suggestionStateLabel('ACCEPTED', 'CLOSED')).toBe('accepted')
    expect(suggestionStateLabel('PASSED', 'CLOSED')).toBe('not used')
    expect(suggestionStateLabel('SUBMITTED', 'ANSWERED')).toBe('waiting on the author')
    expect(waitsOnClosedRequest('SUBMITTED', 'RESOLVED')).toBe(false)
  })
})

/** Phase 14, item 6.12 — the form's limits, refused in plain words. */
describe('a request’s word bounds (FR-5.8)', () => {
  const request = {
    sectionId: 'section',
    kind: 'CONTINUE' as const,
    title: 'Where next',
    ask: 'The scene has to turn on the letter, and I cannot see how to get her to open it without a second character in the room.',
    preContext: Array.from({ length: 120 }, (_, index) => `word${String(index)}`).join(' '),
    maxWords: 400,
  }

  it('says the range, not what the number was compared with', () => {
    const refused = createRequestSchema.safeParse({ ...request, minWords: 50 })
    expect(refused.success).toBe(false)
    expect(refused.error?.issues[0]?.message).toBe(WORD_BOUNDS_SENTENCE)
    expect(WORD_BOUNDS_SENTENCE).toBe('Between 100 and 2,000 words.')
    expect(createRequestSchema.safeParse({ ...request, minWords: 150 }).success).toBe(true)
  })
})

/** Phase 14, item 6.15 (D-8) — the day a request closes by itself. */
describe('closesOn', () => {
  it('is REQUEST_OPEN_DAYS after the day it was opened, or opened again', () => {
    expect(closesOn(new Date('2026-10-18T09:30:00Z')).toISOString()).toBe(
      '2026-11-17T09:30:00.000Z',
    )
  })
})
