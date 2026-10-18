import { describe, expect, it } from 'vitest'

import { maskEmail } from './mask-email'

describe('maskEmail (item 3.2)', () => {
  it('keeps the first letter and the domain', () => {
    expect(maskEmail('vignesh@example.com')).toBe('v…@example.com')
    expect(maskEmail('a@b.co')).toBe('a…@b.co')
  })

  it('gives nothing away for something that is not an address', () => {
    expect(maskEmail('nonsense')).toBe('…')
    expect(maskEmail('@example.com')).toBe('…')
  })
})
