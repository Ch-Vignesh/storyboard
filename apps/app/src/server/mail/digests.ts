import type { Prisma, PrismaClient } from '@storyboard/db'

import { env } from '@/env'
import { logger } from '@/lib/logger'
import {
  HOURLY_TYPES,
  IMMEDIATE_TYPES,
  NOTIFICATIONS,
  type NotificationType,
  sentenceFor,
} from '@/lib/schemas/notifications'
import {
  DIGEST_FAILURES_BEFORE_STOPPING,
  DIGEST_RUN_BUDGET_SECONDS,
  QUIET_REQUEST_NUDGE_DAYS,
  WEEKLY_DIGEST_DAYS,
  WEEKLY_DIGEST_MIN_GAP_DAYS,
} from '@/lib/schemas/constants'
import { PUBLICLY_LISTED } from '@/lib/authz/guard'
import { closeStaleRequests } from '@/server/close-requests'
import { REQUEST_KINDS } from '@/lib/schemas/help'
import { ANSWERS } from '@/server/answers'
import { pruneAuditEvents } from '@/server/audit'
import { pruneRateLimits } from '@/server/limits'
import { targetsFor, type Target } from '@/server/notification-targets'
import { pruneDeadTokens, pruneUnconfirmedAccounts } from '@/server/prune'
import { purgeDeletedAccounts } from '@/server/purge/accounts'
import { purgeAbandonedImports } from '@/server/purge/imports'
import { purgeDeletedStoryboards } from '@/server/purge'
import { alertNewServerErrors } from '@/server/server-error-alerts'
import { pruneServerErrors } from '@/server/server-errors'

import { getMailer, type Mail, type Mailer } from './mailer'
import {
  digestMail,
  notificationMail,
  quietRequestMail,
  type NotificationLine,
} from './templates/notification'
import { unsubscribeUrlFor } from './unsubscribe'

/**
 * Email delivery (FR-12.3, FR-12.4).
 *
 * Plain functions over a database client and a clock, with no scheduler in
 * sight — decision 0012.
 *
 * Deliberately no `server-only` guard, unlike the rest of `server/`: that
 * package throws outside Next's module graph, and `pnpm cron` runs this in
 * plain Node. Nothing here is importable from a client component anyway — it
 * reaches for the database on the first line. `/api/cron/[job]` and `pnpm cron` both call these, and
 * so do the tests, which is the point: the batching rules are testable without
 * waiting an hour.
 *
 * `Notification.emailedAt` is the ledger. A row with `emailedAt` null has not
 * been sent; a run that fails leaves it null and the next run picks it up.
 * That is what makes the hourly digest self-healing (decision 0012).
 */

type Db = PrismaClient | Prisma.TransactionClient

const log = logger.child({ module: 'digests' })

/** FR-12.1 — email defaults to on; a row exists only where it was changed. */
async function emailAllowed(db: Db, userId: string, type: NotificationType): Promise<boolean> {
  const pref = await db.notificationPreference.findUnique({
    where: { userId_type: { userId, type } },
    select: { email: true },
  })
  return pref?.email ?? true
}

/**
 * A notification as a line of an email: where it leads and what it names,
 * worked out against what its recipient may read now, exactly as the in-app
 * list does (`notification-targets.ts`). Built from the payload until the
 * 2026-10-16 spec review, which most payloads could not support. A row that
 * leads nowhere still links somewhere: the list, which says what happened.
 */
function lineFor(row: Pending, targets: Map<string, Target>, appUrl: string): NotificationLine {
  const target = targets.get(row.id)
  return {
    type: row.type,
    url: `${appUrl}${target?.path ?? '/notifications'}`,
    subject: target?.title ?? undefined,
    // Item 6.9 — who did what, in the words the in-app row uses.
    sentence: sentenceFor(row.type, target ?? {}),
  }
}

type Pending = {
  id: string
  type: NotificationType
  payload: Prisma.JsonValue
  user: { id: string; email: string }
}

/**
 * Whether an account can be emailed at all. Not a suspended or deleted one
 * (FR-13.5), not an address nobody has confirmed, and not the seed's
 * `.invalid` addresses: the platform account owns every example request, so
 * every suggestion sent to one queued mail to an address that can only bounce.
 */
function reachable(user: {
  email: string
  status: string
  deletionRequestedAt: Date | null
  emailVerifiedAt: Date | null
}): boolean {
  return (
    user.status === 'ACTIVE' &&
    !user.deletionRequestedAt &&
    user.emailVerifiedAt !== null &&
    !user.email.endsWith('.invalid')
  )
}

const RECIPIENT = {
  id: true,
  email: true,
  status: true,
  deletionRequestedAt: true,
  emailVerifiedAt: true,
} as const

/**
 * The oldest unsent rows of these types: the ones to send, and the ones that
 * can never be sent. The second are marked, not left: rows for a suspended
 * account used to stay at the head of the queue, and once there were 500 of
 * them no run ever reached anyone else (phase 12 audit). Their in-app delivery
 * has already happened.
 */
async function pendingOfTypes(
  db: Db,
  types: readonly NotificationType[],
): Promise<{ pending: Pending[]; unreachable: string[] }> {
  const rows = await db.notification.findMany({
    where: { emailedAt: null, type: { in: [...types] } },
    orderBy: { createdAt: 'asc' },
    take: 500,
    select: { id: true, type: true, payload: true, user: { select: RECIPIENT } },
  })
  return {
    pending: rows
      .filter((row) => reachable(row.user))
      .map((row) => ({
        id: row.id,
        type: row.type,
        payload: row.payload,
        user: { id: row.user.id, email: row.user.email },
      })),
    unreachable: rows.filter((row) => !reachable(row.user)).map((row) => row.id),
  }
}

/**
 * One run's sending, made to survive a bad address and a bad minute.
 *
 * Every send used to sit in one loop with one `markEmailed` at the end, so a
 * single failure, or the platform stopping a slow run, left every row unmarked
 * and the next run sent them all again; every ten minutes, for as long as it
 * kept happening (phase 12 audit). Now each send stands alone, the caller
 * marks what it sent as it goes, and the run stops while it still can: when
 * its time is spent, or when the provider has refused several in a row.
 */
function deliveryRun(mailer: Mailer) {
  const started = Date.now()
  let failuresInARow = 0
  return {
    /** False once the run should stop and leave the rest for the next one. */
    get open(): boolean {
      return (
        Date.now() - started < DIGEST_RUN_BUDGET_SECONDS * 1000 &&
        failuresInARow < DIGEST_FAILURES_BEFORE_STOPPING
      )
    },
    /** True if it went. A failure is logged and never thrown. */
    async send(mail: Mail, context: Record<string, unknown>): Promise<boolean> {
      try {
        await mailer.send(mail)
        failuresInARow = 0
        return true
      } catch (error) {
        failuresInARow += 1
        log.error(
          { event: 'digest.send_failed', ...context, error: String(error) },
          'one email was not sent; the run goes on, and the next run tries it again',
        )
        return false
      }
    },
  }
}

async function markEmailed(db: Db, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return
  await db.notification.updateMany({
    where: { id: { in: [...ids] } },
    data: { emailedAt: new Date() },
  })
}

export type RunResult = { considered: number; sent: number; skipped: number }

/**
 * Options every run accepts.  exists so the tests can assert what would
 * be sent without a transport; production passes nothing and gets the mailer
 * the environment selects.
 */
export type RunOptions = { mailer?: Mailer }

/**
 * FR-12.3 — immediate for decisions on your own work.
 *
 * One message per notification, because the whole point is that it arrives
 * while the decision still matters to the person who was waiting for it.
 */
export async function runImmediate(db: Db, options: RunOptions = {}): Promise<RunResult> {
  const appUrl = env.NEXT_PUBLIC_APP_URL
  const { pending, unreachable } = await pendingOfTypes(db, IMMEDIATE_TYPES)
  const run = deliveryRun(options.mailer ?? getMailer())
  await markEmailed(db, unreachable)

  let sent = 0
  let skipped = unreachable.length

  for (const row of pending) {
    if (!run.open) break
    if (!(await emailAllowed(db, row.user.id, row.type))) {
      // Not emailed, but still marked: the in-app row is the delivery that
      // cannot be disabled, and leaving it pending would retry forever.
      await markEmailed(db, [row.id])
      skipped += 1
      continue
    }

    const line = lineFor(row, await targetsFor(db, row.user.id, [row]), appUrl)
    const mail = notificationMail({
      to: row.user.email,
      line,
      appUrl,
      unsubscribeUrl: unsubscribeUrlFor(appUrl, row.user.id, [row.type]),
    })
    if (await run.send(mail, { notificationId: row.id, userId: row.user.id })) {
      // Marked the moment it went, so nothing after this can send it twice.
      await markEmailed(db, [row.id])
      sent += 1
    }
  }

  log.info(
    { event: 'digest.immediate', considered: pending.length, sent, skipped },
    'immediate run',
  )
  return { considered: pending.length, sent, skipped }
}

/** FR-12.3 — hourly digest for everything that is not about your own work. */
export async function runHourlyDigest(db: Db, options: RunOptions = {}): Promise<RunResult> {
  const appUrl = env.NEXT_PUBLIC_APP_URL
  const { pending, unreachable } = await pendingOfTypes(db, HOURLY_TYPES)
  const run = deliveryRun(options.mailer ?? getMailer())
  await markEmailed(db, unreachable)

  // One message per person, however many things happened.
  const byUser = new Map<string, { email: string; rows: Pending[] }>()
  for (const row of pending) {
    const entry = byUser.get(row.user.id) ?? { email: row.user.email, rows: [] }
    entry.rows.push(row)
    byUser.set(row.user.id, entry)
  }

  let sent = 0
  let skipped = unreachable.length

  for (const [userId, entry] of byUser) {
    if (!run.open) break
    const allowed: Pending[] = []
    const switchedOff: string[] = []
    for (const row of entry.rows) {
      if (await emailAllowed(db, userId, row.type)) allowed.push(row)
      else switchedOff.push(row.id)
    }
    await markEmailed(db, switchedOff)
    skipped += switchedOff.length
    if (allowed.length === 0) continue

    const targets = await targetsFor(db, userId, allowed)
    const lines = allowed.map((row) => lineFor(row, targets, appUrl))
    const went = await run.send(
      digestMail({
        to: entry.email,
        heading:
          allowed.length === 1
            ? NOTIFICATIONS[allowed[0]!.type].label
            : `${String(allowed.length)} things happened`,
        intro:
          lines.length === 1
            ? (lines[0]?.sentence ?? NOTIFICATIONS[allowed[0]!.type].sentence)
            : 'Since the last time we wrote:',
        lines,
        appUrl,
        unsubscribeUrl: unsubscribeUrlFor(appUrl, userId, [
          ...new Set(allowed.map((row) => row.type)),
        ]),
      }),
      { userId },
    )
    if (went) {
      await markEmailed(
        db,
        allowed.map((row) => row.id),
      )
      sent += 1
    }
  }

  log.info({ event: 'digest.hourly', considered: pending.length, sent, skipped }, 'hourly run')
  return { considered: pending.length, sent, skipped }
}

/**
 * FR-12.3 — the Sunday digest of open requests in the genres you pinned.
 *
 * Built from the requests themselves rather than from notification rows: this
 * is a standing summary of what is open, not a record of things that happened
 * to you. What is recorded is whom it went to (phase 14, item 10.6):
 * `User.weeklyDigestSentAt`, set as each one goes, and anyone sent one within
 * `WEEKLY_DIGEST_MIN_GAP_DAYS` is left out. Until then a run repeated by hand
 * emailed everybody twice (the phase 12 audit's H6b); now it reaches only the
 * people a run cut short never got to.
 */
export async function runWeeklyDigest(
  db: Db,
  now: Date = new Date(),
  options: RunOptions = {},
): Promise<RunResult> {
  const appUrl = env.NEXT_PUBLIC_APP_URL
  const run = deliveryRun(options.mailer ?? getMailer())
  const DAY_MS = 24 * 60 * 60 * 1000
  const since = new Date(now.getTime() - WEEKLY_DIGEST_DAYS * DAY_MS)
  const sentBefore = new Date(now.getTime() - WEEKLY_DIGEST_MIN_GAP_DAYS * DAY_MS)

  const readers = await db.user.findMany({
    where: {
      status: 'ACTIVE',
      deletionRequestedAt: null,
      onboardedAt: { not: null },
      emailVerifiedAt: { not: null },
      email: { not: { endsWith: '.invalid' } },
      pinnedGenres: { some: {} },
      OR: [{ weeklyDigestSentAt: null }, { weeklyDigestSentAt: { lt: sentBefore } }],
    },
    select: {
      id: true,
      email: true,
      pinnedGenres: { select: { genreId: true } },
    },
  })

  let sent = 0
  let skipped = 0

  for (const reader of readers) {
    if (!run.open) break
    if (!(await emailAllowed(db, reader.id, 'WEEKLY_DIGEST'))) {
      skipped += 1
      continue
    }

    const genreIds = reader.pinnedGenres.map((entry) => entry.genreId)
    const requests = await db.contributionRequest.findMany({
      where: {
        state: { in: ['OPEN', 'ANSWERED'] },
        createdAt: { gte: since },
        // Never digest someone their own request.
        openedById: { not: reader.id },
        storyboard: {
          ...PUBLICLY_LISTED,
          genres: { some: { genreId: { in: genreIds } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        publicId: true,
        title: true,
        kind: true,
        storyboard: { select: { slug: true } },
      },
    })

    // FR-15.1 — an empty week is not worth an email.
    if (requests.length === 0) {
      skipped += 1
      continue
    }

    const went = await run.send(
      digestMail({
        to: reader.email,
        heading: 'This week in your genres',
        intro: `${String(requests.length)} ${
          requests.length === 1 ? 'writer is' : 'writers are'
        } stuck on something in the genres you pinned.`,
        lines: requests.map((request) => ({
          type: 'WEEKLY_DIGEST' as const,
          url: `${appUrl}/s/${request.storyboard.slug}/help/${request.publicId}`,
          subject: request.title,
          // What each one asks for, under its title.
          sentence: REQUEST_KINDS.find((kind) => kind.value === request.kind)?.label,
        })),
        appUrl,
        unsubscribeUrl: unsubscribeUrlFor(appUrl, reader.id, ['WEEKLY_DIGEST']),
      }),
      { userId: reader.id },
    )
    if (went) {
      // Recorded the moment it went, as `markEmailed` does, and by plain SQL
      // so that `updatedAt` keeps meaning a change to the account.
      await db.$executeRaw`UPDATE "User" SET "weeklyDigestSentAt" = ${now} WHERE "id" = ${reader.id}`
      sent += 1
    }
  }

  log.info({ event: 'digest.weekly', considered: readers.length, sent, skipped }, 'weekly run')
  return { considered: readers.length, sent, skipped }
}

/**
 * FR-12.4 — the seven-day silence nudge, to the author only.
 *
 * Sent once per request: the notification row is the record that it has been,
 * so a request cannot be nudged every day forever.
 */
export async function runQuietNudge(
  db: Db,
  now: Date = new Date(),
  options: RunOptions = {},
): Promise<RunResult> {
  const appUrl = env.NEXT_PUBLIC_APP_URL
  const run = deliveryRun(options.mailer ?? getMailer())
  const cutoff = new Date(now.getTime() - QUIET_REQUEST_NUDGE_DAYS * 24 * 60 * 60 * 1000)

  const quiet = await db.contributionRequest.findMany({
    where: {
      state: 'OPEN',
      createdAt: { lt: cutoff },
      suggestions: { none: ANSWERS },
      // No idea clause: a "help me think" request with an idea from outside
      // the story is ANSWERED, not OPEN (item 1.12), and the author's own
      // thinking aloud used to take it out of here.
      // Nor a hidden story's (item 2.7).
      storyboard: { deletedAt: null, hiddenAt: null },
    },
    select: {
      id: true,
      publicId: true,
      title: true,
      openedById: true,
      storyboard: { select: { slug: true } },
      openedBy: { select: RECIPIENT },
    },
  })

  let sent = 0
  let skipped = 0

  for (const request of quiet) {
    if (!run.open) break
    const already = await db.notification.findFirst({
      where: {
        userId: request.openedById,
        type: 'REQUEST_QUIET_SEVEN_DAYS',
        payload: { path: ['requestId'], equals: request.id },
      },
      select: { id: true },
    })
    if (already || !reachable(request.openedBy)) {
      skipped += 1
      continue
    }

    const requestUrl = `${appUrl}/s/${request.storyboard.slug}/help/${request.publicId}`

    // The in-app row first: it is the delivery that cannot be turned off, and
    // it is also what stops this request being nudged again.
    await db.notification.create({
      data: {
        userId: request.openedById,
        type: 'REQUEST_QUIET_SEVEN_DAYS',
        payload: {
          requestId: request.id,
          requestPublicId: request.publicId,
          slug: request.storyboard.slug,
          title: request.title,
        },
        emailedAt: new Date(),
      },
    })

    if (await emailAllowed(db, request.openedById, 'REQUEST_QUIET_SEVEN_DAYS')) {
      const went = await run.send(
        quietRequestMail({
          to: request.openedBy.email,
          requestTitle: request.title,
          requestUrl,
          // Item 6.16 — the fix, where it is made (item 6.1).
          editUrl: `${requestUrl}/edit`,
          appUrl,
          unsubscribeUrl: unsubscribeUrlFor(appUrl, request.openedById, [
            'REQUEST_QUIET_SEVEN_DAYS',
          ]),
        }),
        { requestId: request.id },
      )
      if (went) sent += 1
    } else {
      skipped += 1
    }
  }

  log.info({ event: 'digest.quietNudge', considered: quiet.length, sent, skipped }, 'nudge run')
  return { considered: quiet.length, sent, skipped }
}

export const CRON_JOBS = {
  immediate: runImmediate,
  hourly: async (db: Db) => ({
    ...(await runHourlyDigest(db)),
    // Phase 14, item 10.1 (D-10) — and the administrators hear of any new
    // kind of server error, after the digest so a fault here costs nobody
    // their email.
    errors: await alertNewServerErrors(db as PrismaClient),
  }),
  weekly: (db: Db) => runWeeklyDigest(db),
  nudge: (db: Db) => runQuietNudge(db),
  // Not mail, but the same runner: one scheduler is easier to reason about
  // than two, and this is the only other thing that wants a daily tick.
  prune: async (db: Db) => ({
    limits: await pruneRateLimits(db as PrismaClient),
    // Item 3.12 — dead sign-in links, then sign-ups nobody finished.
    links: await pruneDeadTokens(db as PrismaClient),
    unconfirmed: await pruneUnconfirmedAccounts(db as PrismaClient),
    // Item 10.1 — server errors past their month.
    serverErrors: await pruneServerErrors(db as PrismaClient),
    // Item 10.2 — stored events past their year.
    events: await pruneAuditEvents(db as PrismaClient),
  }),
  /*
   * FR-2.6 and OD-3's second half. Storyboards whose thirty days are up, then
   * accounts whose seven are (decision 0024).
   *
   * One job rather than a seventh cron entry: both are "the grace period
   * expired, finish the job", both want a daily tick, and a scheduled entry
   * that has to be added to a hosting account is a step somebody forgets —
   * which on this endpoint fails silently, because it fails closed.
   *
   * Storyboards first. An account purge does not touch storyboards, but doing
   * the rows-and-revisions work before the identity work means a failure in the
   * harder half never leaves an account half-erased.
   *
   * Then imports nobody finished, whose uploads would otherwise stay in the
   * bucket for good. Last, because an account purge removes its own.
   *
   * And before any of it, the requests whose thirty days are up (FR-11.3 with
   * D-8, item 6.15, decision 0050): the same daily tick, and a request on a
   * storyboard about to be purged closes with it either way.
   */
  purge: async (db: Db) => ({
    requests: await closeStaleRequests(db as PrismaClient),
    storyboards: await purgeDeletedStoryboards(db as PrismaClient),
    accounts: await purgeDeletedAccounts(db as PrismaClient),
    imports: await purgeAbandonedImports(db as PrismaClient),
  }),
} as const

export type CronJob = keyof typeof CRON_JOBS
