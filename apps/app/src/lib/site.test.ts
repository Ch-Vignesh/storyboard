import { describe, expect, it } from 'vitest'

import { contactFrom } from './site'

/** Phase 14, item 2.5 — the address a person can write to, needed by item 1.15. */
describe('the contact address', () => {
  it('is the support address when one is set', () => {
    expect(contactFrom('help@example.test', 'Draftboard <hello@example.test>')).toBe(
      'help@example.test',
    )
  })

  it('falls back to the address inside the sender', () => {
    expect(contactFrom(undefined, 'Draftboard <hello@example.test>')).toBe('hello@example.test')
    expect(contactFrom('', 'Draftboard <hello@example.test>')).toBe('hello@example.test')
    expect(contactFrom(undefined, 'hello@example.test')).toBe('hello@example.test')
  })
})
