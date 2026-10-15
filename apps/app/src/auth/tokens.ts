import { createHash, randomBytes } from 'node:crypto'

import {
  PASSWORD_RESET_TTL_MINUTES,
  VERIFICATION_RESEND_COOLDOWN_SECONDS,
  VERIFICATION_TOKEN_TTL_HOURS,
} from '@/lib/schemas/constants'

/** FR-1.4: verification links live for 24 hours. */
export const VERIFICATION_TOKEN_TTL_MS = VERIFICATION_TOKEN_TTL_HOURS * 60 * 60 * 1000
/** FR-1.4: a new link can be requested once per minute, whatever kind of address. */
export const VERIFICATION_RESEND_COOLDOWN_MS = VERIFICATION_RESEND_COOLDOWN_SECONDS * 1000

export function generateToken(): string {
  return randomBytes(32).toString('base64url')
}

/** Only the hash is stored; a database leak does not yield working links. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function createVerificationToken(now = new Date()) {
  const token = generateToken()
  return {
    token,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + VERIFICATION_TOKEN_TTL_MS),
  }
}

/** FR-1.7: a password reset link, the same kind of token with a shorter life. */
export function createPasswordResetToken(now = new Date()) {
  const token = generateToken()
  return {
    token,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000),
  }
}
