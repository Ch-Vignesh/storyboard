import { createHmac, timingSafeEqual } from 'node:crypto'

import type { Prisma, PrismaClient } from '@storyboard/db'
import { z } from 'zod'

import { env } from '@/env'
import { logger } from '@/lib/logger'
import { NOTIFICATION_TYPES, type NotificationType } from '@/lib/schemas/notifications'

type Db = PrismaClient | Prisma.TransactionClient

/**
 * FR-12.1, FR-12.5 (phase 14, item 2.4) — the token in a List-Unsubscribe
 * link: who, and which kinds of email, signed with HMAC-SHA256 under
 * `AUTH_SECRET` and written base64url, with no expiry. A mail client may press
 * it years after the email arrived and it must still work. What it can do is
 * only turn email off, so a token that leaks costs the person some email and
 * nothing else.
 */
export type UnsubscribeScope = { userId: string; types: readonly NotificationType[] | 'all' }

const PAYLOAD = z.object({
  u: z.string().min(1),
  t: z.union([z.literal('all'), z.array(z.enum(NOTIFICATION_TYPES)).min(1)]),
})

function mac(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function signUnsubscribe(scope: UnsubscribeScope, secret: string): string {
  const payload = Buffer.from(
    JSON.stringify({ u: scope.userId, t: scope.types === 'all' ? 'all' : [...scope.types] }),
  ).toString('base64url')
  return `${payload}.${mac(payload, secret)}`
}

/** The scope a token names, or null for a token that was not ours or was changed. */
export function readUnsubscribe(token: string, secret: string): UnsubscribeScope | null {
  const parts = token.split('.')
  const [payload, signature] = parts
  if (parts.length !== 2 || !payload || !signature) return null
  const expected = mac(payload, secret)
  if (
    expected.length !== signature.length ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  ) {
    return null
  }
  try {
    const parsed = PAYLOAD.safeParse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')))
    if (!parsed.success) return null
    return { userId: parsed.data.u, types: parsed.data.t }
  } catch {
    return null
  }
}

/** The link an email carries, for this person and the kinds of email it is. */
export function unsubscribeUrlFor(
  appUrl: string,
  userId: string,
  types: readonly NotificationType[] | 'all',
): string {
  return `${appUrl}/unsubscribe?t=${encodeURIComponent(signUnsubscribe({ userId, types }, env.AUTH_SECRET))}`
}

/** What the page and the one-click endpoint show: the kinds of email a token covers. */
export function scopeLabels(
  scope: UnsubscribeScope,
  labels: Record<NotificationType, { label: string }>,
): string[] {
  return scope.types === 'all'
    ? ['every kind of notification']
    : scope.types.map((type) => labels[type].label.toLowerCase())
}

/**
 * Turns email off for the kinds the token names, as the settings screen
 * would. An erased account has no preferences to keep and gets none back.
 */
export async function stopEmail(db: Db, scope: UnsubscribeScope): Promise<void> {
  const user = await db.user.findUnique({ where: { id: scope.userId }, select: { status: true } })
  if (!user || user.status === 'DELETED') return
  const types = scope.types === 'all' ? NOTIFICATION_TYPES : scope.types
  for (const type of types) {
    await db.notificationPreference.upsert({
      where: { userId_type: { userId: scope.userId, type } },
      create: { userId: scope.userId, type, email: false },
      update: { email: false },
    })
  }
  logger.info(
    { event: 'mail.unsubscribed', userId: scope.userId, types: [...types] },
    'email turned off from a link',
  )
}
