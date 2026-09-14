import { describe, expect, it } from 'vitest'

import {
  createVerificationToken,
  hashToken,
  isWithinResendCooldown,
  VERIFICATION_RESEND_COOLDOWN_MS,
  VERIFICATION_TOKEN_TTL_MS,
} from './tokens'

describe('verification tokens (FR-1.4)', () => {
  it('issues a URL-safe token whose stored form is a sha256 hash', () => {
    const now = new Date('2026-09-12T10:00:00Z')
    const { token, tokenHash, expiresAt } = createVerificationToken(now)
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(tokenHash).toBe(hashToken(token))
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(expiresAt.getTime() - now.getTime()).toBe(VERIFICATION_TOKEN_TTL_MS)
  })

  it('expires after 24 hours', () => {
    expect(VERIFICATION_TOKEN_TTL_MS).toBe(24 * 60 * 60 * 1000)
  })

  it('never issues the same token twice', () => {
    expect(createVerificationToken().token).not.toBe(createVerificationToken().token)
  })

  it('enforces a 60-second resend cooldown', () => {
    const issued = new Date('2026-09-12T10:00:00Z')
    expect(VERIFICATION_RESEND_COOLDOWN_MS).toBe(60_000)
    expect(isWithinResendCooldown(issued, new Date(issued.getTime() + 30_000))).toBe(true)
    expect(isWithinResendCooldown(issued, new Date(issued.getTime() + 60_000))).toBe(false)
    expect(isWithinResendCooldown(null)).toBe(false)
    expect(isWithinResendCooldown(undefined)).toBe(false)
  })
})
