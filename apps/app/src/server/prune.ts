import type { PrismaClient } from '@storyboard/db'

import { logger } from '@/lib/logger'
import {
  UNCONFIRMED_ACCOUNT_RETENTION_DAYS,
  USED_TOKEN_RETENTION_DAYS,
} from '@/lib/schemas/constants'

const log = logger.child({ module: 'prune' })
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Phase 14, item 3.12 — the daily tidy-up of what signing in leaves behind.
 * Both run from the `prune` cron job beside the rate-limit rows.
 *
 * Links: a confirmation, reset or email-change link that was used or has
 * expired is dead. A dead one is kept `USED_TOKEN_RETENTION_DAYS` so that a
 * link opened late can still be told apart — "that one was used, the account
 * is ready" rather than "nothing here" (item 1.16) — and then dropped.
 */
export async function pruneDeadTokens(
  db: PrismaClient,
  now = new Date(),
): Promise<{ verification: number; reset: number; emailChange: number }> {
  const before = new Date(now.getTime() - USED_TOKEN_RETENTION_DAYS * DAY_MS)
  const dead = { OR: [{ consumedAt: { lt: before } }, { expiresAt: { lt: before } }] }
  const [verification, reset, emailChange] = await Promise.all([
    db.emailVerificationToken.deleteMany({ where: dead }),
    db.passwordResetToken.deleteMany({ where: dead }),
    db.emailChangeToken.deleteMany({ where: dead }),
  ])
  const deleted = {
    verification: verification.count,
    reset: reset.count,
    emailChange: emailChange.count,
  }
  log.info({ event: 'prune.tokens', ...deleted }, 'dead sign-in links dropped')
  return deleted
}

/**
 * An address that signed up and never confirmed is a row with an email in it
 * and nothing else: no password, no confirmed address, no username, and
 * nothing written, because nothing can be written without signing in and
 * nobody signs in without one of the first two. After
 * `UNCONFIRMED_ACCOUNT_RETENTION_DAYS` it is removed, its links with it.
 *
 * Every relation a user row can have is in the filter rather than trusted:
 * such an account cannot have made anything, and the filter makes that a
 * fact the delete depends on instead of an assumption it rests on. A Google
 * account is never one of these: signing in with Google confirms the address.
 */
export async function pruneUnconfirmedAccounts(
  db: PrismaClient,
  now = new Date(),
): Promise<{ deleted: number }> {
  const before = new Date(now.getTime() - UNCONFIRMED_ACCOUNT_RETENTION_DAYS * DAY_MS)
  const { count } = await db.user.deleteMany({
    where: {
      createdAt: { lt: before },
      emailVerifiedAt: null,
      passwordHash: null,
      username: null,
      role: 'USER',
      featureFlagsSet: { none: {} },
      pinnedGenres: { none: {} },
      storyboards: { none: {} },
      collaborations: { none: {} },
      invitationsSent: { none: {} },
      versionsCreated: { none: {} },
      revisionsAuthored: { none: {} },
      revisionsAccepted: { none: {} },
      drafts: { none: {} },
      requestsOpened: { none: {} },
      suggestions: { none: {} },
      suggestionsDecided: { none: {} },
      ideas: { none: {} },
      credits: { none: {} },
      notifications: { none: {} },
      notificationPrefs: { none: {} },
      reportsMade: { none: {} },
      reportsResolved: { none: {} },
      activity: { none: {} },
      importJobs: { none: {} },
      adminGrants: { none: {} },
      grantsGiven: { none: {} },
      blocksMade: { none: {} },
      blocksReceived: { none: {} },
      suspendedUsers: { none: {} },
    },
  })
  log.info({ event: 'prune.unconfirmedAccounts', deleted: count }, 'unconfirmed sign-ups removed')
  return { deleted: count }
}
