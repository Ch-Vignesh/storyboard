import { describe, expect, it } from 'vitest'

import {
  emailSchema,
  isReservedUsername,
  passwordSchema,
  passwordShortfall,
  usernameSchema,
} from './auth'

describe('emailSchema', () => {
  it('trims and lowercases', () => {
    expect(emailSchema.parse('  Maya@Example.COM ')).toBe('maya@example.com')
  })

  it('rejects malformed addresses', () => {
    expect(emailSchema.safeParse('not-an-email').success).toBe(false)
    expect(emailSchema.safeParse('').success).toBe(false)
  })
})

describe('passwordSchema (D-17, phase 14 item 3.9)', () => {
  const firstIssue = (value: string) => passwordSchema.safeParse(value).error?.issues[0]?.message

  it('wants the length and the four kinds of character, and names the first one missing', () => {
    expect(passwordSchema.safeParse('Harbour at dawn 1!').success).toBe(true)
    expect(firstIssue('Hd1!')).toBe('Use at least 10 characters.')
    expect(firstIssue('HARBOUR AT DAWN 1!')).toBe('Add a lower-case letter.')
    expect(firstIssue('harbour at dawn 1!')).toBe('Add a capital letter.')
    expect(firstIssue('Harbour at dawn!!')).toBe('Add a number.')
    expect(firstIssue('Harbour at dawn 11')).toBe('Add a symbol, like ! or ?.')
    expect(passwordSchema.safeParse(`Aa1!${'x'.repeat(125)}`).success).toBe(false)
  })

  it('does not count a space as a symbol, and takes any letter the world writes', () => {
    expect(passwordShortfall('Harbour at dawn 11 ')).toBe('Add a symbol, like ! or ?.')
    expect(passwordShortfall('Ünterwegs nach 9 Uhr?')).toBeNull()
    expect(passwordShortfall('')).toBe('Use at least 10 characters.')
  })
})

describe('usernameSchema (FR-1.3)', () => {
  it('accepts lowercase letters, digits and inner hyphens', () => {
    expect(usernameSchema.parse(' Maya-Chen ')).toBe('maya-chen')
    expect(usernameSchema.safeParse('leah42').success).toBe(true)
  })

  it('rejects bad shapes', () => {
    for (const bad of ['ab', '-maya', 'maya-', 'maya chen', 'maya_chen', 'x'.repeat(31)]) {
      expect(usernameSchema.safeParse(bad).success, bad).toBe(false)
    }
  })

  // Phase 12 audit: a person holding one of these broke every later seed run.
  it('rejects the names the seed’s own accounts use, the old one included', () => {
    for (const reserved of [
      'draftboard-examples',
      'storyboard-examples',
      'example-helper-1',
      'example-helper-2',
    ]) {
      expect(usernameSchema.safeParse(reserved).success, reserved).toBe(false)
    }
  })

  it('rejects reserved names that collide with routes', () => {
    for (const reserved of ['admin', 'settings', 'signin', 'browse']) {
      expect(usernameSchema.safeParse(reserved).success, reserved).toBe(false)
    }
  })

  // Phase 14, item 3.7 — the staff-sounding, the nobody-sounding, and every
  // top-level route, so a profile address can never shadow a page.
  it('rejects names that would pose as staff or nobody, and the newer routes', () => {
    for (const reserved of [
      'moderator',
      'staff',
      'null',
      'anonymous',
      'contact',
      'terms',
      's',
      'u',
    ]) {
      expect(usernameSchema.safeParse(reserved).success, reserved).toBe(false)
      expect(isReservedUsername(reserved.toUpperCase())).toBe(true)
    }
    expect(isReservedUsername('maya-chen')).toBe(false)
  })
})
