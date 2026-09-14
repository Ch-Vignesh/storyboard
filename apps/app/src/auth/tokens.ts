import { createHash, randomBytes } from 'node:crypto'

/** FR-1.4: verification links live for 24 hours. */
export const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000
/** FR-1.4: a new link can be requested once per minute. */
export const VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000

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

export function isWithinResendCooldown(
  lastIssuedAt: Date | null | undefined,
  now = new Date(),
): boolean {
  if (!lastIssuedAt) return false
  return now.getTime() - lastIssuedAt.getTime() < VERIFICATION_RESEND_COOLDOWN_MS
}
