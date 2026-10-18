import { describe, expect, it } from 'vitest'

import { afterSignIn, safeNext, withNext } from './safe-next'

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

/**
 * Phase 14, item 3.5 — `next` now rides through sign-up, the emailed link and
 * both onboarding steps, and the proxy forwards it from step to step. So a
 * `next` that names one of the doors would send a finished person round again.
 */
describe('never back into the doors', () => {
  it('refuses sign-in, sign-up, the link pages and onboarding as destinations', () => {
    for (const door of [
      '/signin',
      '/signin?next=%2Fbrowse',
      '/signup',
      '/verify?token=abc',
      '/forgot-password',
      '/reset-password?token=abc',
      '/onboarding/username',
      '/onboarding/genres?next=%2F',
    ]) {
      expect(safeNext(door), door).toBe('/')
    }
    // A page whose name merely begins the same way is not a door.
    expect(safeNext('/signings')).toBe('/signings')
  })

  it('withNext adds the destination only when there is one', () => {
    expect(withNext('/signup', '/')).toBe('/signup')
    expect(withNext('/signup', '/s/x/help/y')).toBe('/signup?next=%2Fs%2Fx%2Fhelp%2Fy')
  })

  it('afterSignIn lands every sign-in on the username step, destination in hand', () => {
    expect(afterSignIn(undefined)).toBe('/onboarding/username')
    expect(afterSignIn('/')).toBe('/onboarding/username')
    expect(afterSignIn('/s/x/help/y')).toBe('/onboarding/username?next=%2Fs%2Fx%2Fhelp%2Fy')
    expect(afterSignIn('https://evil.example')).toBe('/onboarding/username')
  })
})
