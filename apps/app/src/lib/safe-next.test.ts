import { describe, expect, it } from 'vitest'

import { safeNext } from './safe-next'

/**
 * The value comes from a URL, so the tests are mostly about what it refuses.
 * An open redirect on a sign-in page is worth more to an attacker than most
 * bugs in this product: it borrows our domain to make their page look like
 * ours, after the person has just proved they trust us enough to type a
 * password.
 */
describe('where to go after signing in', () => {
  it('keeps a path on this site', () => {
    expect(safeNext('/s/the-ship-never-lands-abc/help/new')).toBe(
      '/s/the-ship-never-lands-abc/help/new',
    )
    expect(safeNext('/browse?sort=newest')).toBe('/browse?sort=newest')
    expect(safeNext('/s/x#chapter-two')).toBe('/s/x#chapter-two')
  })

  it('refuses another site, however it is spelled', () => {
    for (const hostile of [
      'https://evil.example',
      'http://evil.example',
      '//evil.example',
      '/\\evil.example',
      '\\\\evil.example',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      '/redirect?to=https://evil.example\n',
    ]) {
      expect(safeNext(hostile), hostile).toBe('/')
    }
  })

  it('refuses anything that is not a single string', () => {
    expect(safeNext(undefined)).toBe('/')
    expect(safeNext(['/a', '/b'])).toBe('/')
  })

  it('refuses a relative path, which would resolve against the sign-in page', () => {
    expect(safeNext('browse')).toBe('/')
    expect(safeNext('../admin')).toBe('/')
  })

  it('normalises rather than trusting: a traversal cannot climb off the site', () => {
    // `new URL` resolves this to `/` on the same origin, which is safe.
    expect(safeNext('/../../etc/passwd')).toBe('/etc/passwd')
  })
})
