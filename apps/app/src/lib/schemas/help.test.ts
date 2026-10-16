import { describe, expect, it } from 'vitest'

import { suggestionStateLabel, waitsOnClosedRequest } from './help'

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
