import type { PrismaClient } from '@storyboard/db'

import { logger } from '@/lib/logger'
import { LAST_SEEN_TOUCH_HOURS } from '@/lib/schemas/constants'

import { afterResponse } from './after-response'

const log = logger.child({ module: 'last-seen' })

/**
 * Decision 0043 (phase 14, item 2b.4) — when an account was last here, to the
 * hour. Called where the account is read for a request. It writes at most
 * once an hour per account, after the response has gone, and by plain SQL so
 * that `User.updatedAt` keeps meaning a change to the account itself. A
 * failure is logged and nothing more: a count on the admin's overview is not
 * worth a failed page.
 */
export async function noteSeen(
  db: PrismaClient,
  user: { id: string; lastSeenAt: Date | null },
  now = new Date(),
): Promise<void> {
  const freshUntil = now.getTime() - LAST_SEEN_TOUCH_HOURS * 60 * 60 * 1000
  if (user.lastSeenAt && user.lastSeenAt.getTime() > freshUntil) return
  await afterResponse(async () => {
    try {
      await db.$executeRaw`UPDATE "User" SET "lastSeenAt" = ${now} WHERE "id" = ${user.id}`
    } catch (error) {
      log.warn({ err: error, userId: user.id }, 'could not note the account as seen')
    }
  })
}
