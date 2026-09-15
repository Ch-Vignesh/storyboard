import { describe, expect, it } from 'vitest'

import { FORMER_CONTRIBUTOR, hasProfile, nameOf } from './people'

describe('naming a person', () => {
  it('prefers the name they chose to show', () => {
    expect(nameOf({ username: 'jrivera', displayName: 'J. Rivera' })).toBe('J. Rivera')
  })

  it('falls back to the username when there is no display name', () => {
    expect(nameOf({ username: 'jrivera', displayName: null })).toBe('jrivera')
  })

  /** Decision 0013 — absence is a right exercised, not a data problem. */
  it('names an erased contributor rather than calling them unknown', () => {
    expect(nameOf(null)).toBe(FORMER_CONTRIBUTOR)
    expect(FORMER_CONTRIBUTOR).not.toMatch(/unknown|deleted|anonymous/i)
  })

  it('names a person whose record survives without either name', () => {
    expect(nameOf({ id: 'u1', username: null, displayName: null })).toBe(FORMER_CONTRIBUTOR)
  })
})

describe('linking to a profile', () => {
  it('links when there is a username to link to', () => {
    expect(hasProfile({ username: 'jrivera' })).toBe(true)
  })

  it('does not link an erased person, or one who never finished signing up', () => {
    expect(hasProfile(null)).toBe(false)
    expect(hasProfile({ id: 'u1', username: null })).toBe(false)
    expect(hasProfile({ id: 'u1', username: '' })).toBe(false)
  })
})
