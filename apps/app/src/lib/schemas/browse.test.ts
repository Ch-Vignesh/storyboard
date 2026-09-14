import { describe, expect, it } from 'vitest'

import { filtersFromParams, paramsFromFilters } from './browse'

/**
 * A URL is something anyone can type, edit or truncate, so browse has to
 * survive whatever comes back. The alternative is a 500 on a shared link.
 */
describe('filtersFromParams', () => {
  it('reads a well-formed query', () => {
    const filters = filtersFromParams(
      new URLSearchParams('q=harbour&kind=UNBLOCK&sort=NO_ANSWERS&age=WEEK&min=200&max=800'),
    )
    expect(filters.query).toBe('harbour')
    expect(filters.kinds).toEqual(['UNBLOCK'])
    expect(filters.sort).toBe('NO_ANSWERS')
    expect(filters.age).toBe('WEEK')
    expect(filters.minWords).toBe(200)
    expect(filters.maxWords).toBe(800)
  })

  it('falls back to defaults on an empty query', () => {
    const filters = filtersFromParams(new URLSearchParams())
    expect(filters.sort).toBe('RECENT')
    expect(filters.age).toBe('ANY')
  })

  it.each([
    ['sort=garbage'],
    ['age=nonsense'],
    ['kind=INVALID'],
    ['type=NOT_A_TYPE'],
    ['min=99999'],
    ['min=notanumber'],
    ['genre=' + 'x'.repeat(500)],
  ])('survives %s rather than throwing', (query) => {
    expect(() => filtersFromParams(new URLSearchParams(query))).not.toThrow()
  })

  it('keeps the good parameters when one is bad', () => {
    // A single bad value should not discard an otherwise useful view.
    const filters = filtersFromParams(new URLSearchParams('q=harbour&sort=garbage'))
    expect(filters.query).toBe('harbour')
    expect(filters.sort).toBe('RECENT')
  })

  it('round-trips through the URL', () => {
    const filters = filtersFromParams(new URLSearchParams('q=tide&kind=REWRITE&sort=CLOSING_SOON'))
    const back = filtersFromParams(paramsFromFilters(filters))
    expect(back).toEqual(filters)
  })
})
