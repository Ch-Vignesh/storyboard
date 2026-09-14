import { describe, expect, it } from 'vitest'

import { emailSchema, passwordSchema, usernameSchema } from './auth'

describe('emailSchema', () => {
  it('trims and lowercases', () => {
    expect(emailSchema.parse('  Maya@Example.COM ')).toBe('maya@example.com')
  })

  it('rejects malformed addresses', () => {
    expect(emailSchema.safeParse('not-an-email').success).toBe(false)
    expect(emailSchema.safeParse('').success).toBe(false)
  })
})

describe('passwordSchema', () => {
  it('requires 10 to 128 characters and nothing else', () => {
    expect(passwordSchema.safeParse('short').success).toBe(false)
    expect(passwordSchema.safeParse('a passphrase is fine').success).toBe(true)
    expect(passwordSchema.safeParse('x'.repeat(129)).success).toBe(false)
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

  it('rejects reserved names that collide with routes', () => {
    for (const reserved of ['admin', 'settings', 'signin', 'browse']) {
      expect(usernameSchema.safeParse(reserved).success, reserved).toBe(false)
    }
  })
})
