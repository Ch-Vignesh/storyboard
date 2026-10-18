import 'server-only'

import { env } from '@/env'

/**
 * Phase 14, item 2.5 — the address a person can write to: for help, an
 * appeal (decision 0018), someone else's work copied by a person without an
 * account, or a security problem. `SUPPORT_EMAIL` when it is set; otherwise
 * the address inside `EMAIL_FROM`, which is never empty. Never required, so
 * the deployment preflight is unchanged.
 */
export function contactFrom(supportEmail: string | undefined, emailFrom: string): string {
  const support = supportEmail?.trim()
  if (support) return support
  const inBrackets = /<([^<>\s]+@[^<>\s]+)>/u.exec(emailFrom)?.[1]
  return inBrackets ?? emailFrom.trim()
}

export function contactAddress(): string {
  return contactFrom(env.SUPPORT_EMAIL, env.EMAIL_FROM)
}
