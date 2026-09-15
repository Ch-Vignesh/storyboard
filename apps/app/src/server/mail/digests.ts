import type { Prisma, PrismaClient } from '@storyboard/db'

import { env } from '@/env'
import { logger } from '@/lib/logger'
import {
  HOURLY_TYPES,
  IMMEDIATE_TYPES,
  NOTIFICATIONS,
  type NotificationType,
} from '@/lib/schemas/notifications'
import { QUIET_REQUEST_NUDGE_DAYS } from '@/lib/schemas/constants'
import { pruneRateLimits } from '@/server/limits'
import { purgeDeletedStoryboards } from '@/server/purge'

import { getMailer, type Mailer } from './mailer'
import {
  digestMail,
  notificationMail,
  quietRequestMail,
  type NotificationLine,
} from './templates/notification'

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

/** Where a notification points, built from its payload. */
function urlFor(type: NotificationType, payload: Prisma.JsonValue, appUrl: string): string {
  const data = (payload ?? {}) as Record<string, unknown>
  const slug = typeof data.slug === 'string' ? data.slug : null
  const requestPublicId = typeof data.requestPublicId === 'string' ? data.requestPublicId : null

  if (slug && requestPublicId) return `${appUrl}/s/${slug}/help/${requestPublicId}`
  if (slug) return `${appUrl}/s/${slug}`
  void type
  return `${appUrl}/notifications`
}

/** The human-readable thing a notification is about, if its payload carries one. */
function subjectFor(payload: Prisma.JsonValue): string | undefined {
  const data = (payload ?? {}) as Record<string, unknown>
  return typeof data.title === 'string' ? data.title : undefined
}

type Pending = {
  id: string
  type: NotificationType
  payload: Prisma.JsonValue
  user: { id: string; email: string }
}

async function pendingOfTypes(db: Db, types: readonly NotificationType[]): Promise<Pending[]> {
  const rows = await db.notification.findMany({
    where: { emailedAt: null, type: { in: [...types] } },
    orderBy: { createdAt: 'asc' },
    take: 500,
    select: {
      id: true,
      type: true,
      payload: true,
      user: { select: { id: true, email: true, status: true } },
    },
  })
  // A suspended or deleted account is not emailed (FR-13.5).
  return rows
    .filter((row) => row.user.status === 'ACTIVE')
    .map((row) => ({
      id: row.id,
      type: row.type,
      payload: row.payload,
      user: { id: row.user.id, email: row.user.email },
    }))
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
  const pending = await pendingOfTypes(db, IMMEDIATE_TYPES)
  const mailer = options.mailer ?? getMailer()

  let sent = 0
  let skipped = 0
  const done: string[] = []

  for (const row of pending) {
    if (!(await emailAllowed(db, row.user.id, row.type))) {
      // Not emailed, but still marked: the in-app row is the delivery that
      // cannot be disabled, and leaving it pending would retry forever.
      done.push(row.id)
      skipped += 1
      continue
    }

    const line: NotificationLine = {
      type: row.type,
      url: urlFor(row.type, row.payload, appUrl),
      subject: subjectFor(row.payload),
    }
    await mailer.send(notificationMail({ to: row.user.email, line, appUrl }))
    done.push(row.id)
    sent += 1
  }

  await markEmailed(db, done)
  log.info(
    { event: 'digest.immediate', considered: pending.length, sent, skipped },
    'immediate run',
  )
  return { considered: pending.length, sent, skipped }
}

/** FR-12.3 — hourly digest for everything that is not about your own work. */
export async function runHourlyDigest(db: Db, options: RunOptions = {}): Promise<RunResult> {
  const appUrl = env.NEXT_PUBLIC_APP_URL
  const pending = await pendingOfTypes(db, HOURLY_TYPES)
  const mailer = options.mailer ?? getMailer()

  // One message per person, however many things happened.
  const byUser = new Map<string, { email: string; rows: Pending[] }>()
  for (const row of pending) {
    const entry = byUser.get(row.user.id) ?? { email: row.user.email, rows: [] }
    entry.rows.push(row)
    byUser.set(row.user.id, entry)
  }

  let sent = 0
  let skipped = 0
  const done: string[] = []

  for (const [userId, entry] of byUser) {
    const allowed: Pending[] = []
    for (const row of entry.rows) {
      if (await emailAllowed(db, userId, row.type)) allowed.push(row)
      else {
        done.push(row.id)
        skipped += 1
      }
    }
    if (allowed.length === 0) continue

    await mailer.send(
      digestMail({
        to: entry.email,
        heading:
          allowed.length === 1
            ? NOTIFICATIONS[allowed[0]!.type].label
            : `${String(allowed.length)} things happened`,
        intro:
          allowed.length === 1
            ? NOTIFICATIONS[allowed[0]!.type].sentence
            : 'Since the last time we wrote:',
        lines: allowed.map((row) => ({
          type: row.type,
          url: urlFor(row.type, row.payload, appUrl),
          subject: subjectFor(row.payload),
        })),
        appUrl,
      }),
    )
    done.push(...allowed.map((row) => row.id))
    sent += 1
  }

  await markEmailed(db, done)
  log.info({ event: 'digest.hourly', considered: pending.length, sent, skipped }, 'hourly run')
  return { considered: pending.length, sent, skipped }
}

/**
 * FR-12.3 — the Sunday digest of open requests in the genres you pinned.
 *
 * Built from the requests themselves rather than from notification rows: this
 * is a standing summary of what is open, not a record of things that happened
 * to you, so there is nothing to mark as emailed.
 */
export async function runWeeklyDigest(
  db: Db,
  now: Date = new Date(),
  options: RunOptions = {},
): Promise<RunResult> {
  const appUrl = env.NEXT_PUBLIC_APP_URL
  const mailer = options.mailer ?? getMailer()
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const readers = await db.user.findMany({
    where: {
      status: 'ACTIVE',
      onboardedAt: { not: null },
      pinnedGenres: { some: {} },
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
          visibility: 'PUBLIC',
          deletedAt: null,
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

    await mailer.send(
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
        })),
        appUrl,
      }),
    )
    sent += 1
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
  const mailer = options.mailer ?? getMailer()
  const cutoff = new Date(now.getTime() - QUIET_REQUEST_NUDGE_DAYS * 24 * 60 * 60 * 1000)

  const quiet = await db.contributionRequest.findMany({
    where: {
      state: 'OPEN',
      createdAt: { lt: cutoff },
      suggestions: { none: {} },
      ideas: { none: {} },
      storyboard: { deletedAt: null },
    },
    select: {
      id: true,
      publicId: true,
      title: true,
      openedById: true,
      storyboard: { select: { slug: true } },
      openedBy: { select: { email: true, status: true } },
    },
  })

  let sent = 0
  let skipped = 0

  for (const request of quiet) {
    const already = await db.notification.findFirst({
      where: {
        userId: request.openedById,
        type: 'REQUEST_QUIET_SEVEN_DAYS',
        payload: { path: ['requestId'], equals: request.id },
      },
      select: { id: true },
    })
    if (already || request.openedBy.status !== 'ACTIVE') {
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
      await mailer.send(
        quietRequestMail({
          to: request.openedBy.email,
          requestTitle: request.title,
          requestUrl,
          widenUrl: `${requestUrl}?widen=1`,
          appUrl,
        }),
      )
      sent += 1
    } else {
      skipped += 1
    }
  }

  log.info({ event: 'digest.quietNudge', considered: quiet.length, sent, skipped }, 'nudge run')
  return { considered: quiet.length, sent, skipped }
}

export const CRON_JOBS = {
  immediate: runImmediate,
  hourly: runHourlyDigest,
  weekly: (db: Db) => runWeeklyDigest(db),
  nudge: (db: Db) => runQuietNudge(db),
  // Not mail, but the same runner: one scheduler is easier to reason about
  // than two, and this is the only other thing that wants a daily tick.
  prune: (db: Db) => pruneRateLimits(db as PrismaClient),
  // FR-2.6 — the thirty days are up. Same runner, same daily tick.
  purge: (db: Db) => purgeDeletedStoryboards(db as PrismaClient),
} as const

export type CronJob = keyof typeof CRON_JOBS
