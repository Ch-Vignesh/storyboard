import type { PrismaClient } from '@storyboard/db'

import { env } from '@/env'
import { canAdmin } from '@/lib/authz/admin'
import { logger } from '@/lib/logger'
import { SERVER_ERRORS } from '@/lib/schemas/constants'
import { formatInZone } from '@/lib/time-zone'
import { getMailer, type Mailer } from '@/server/mail/mailer'
import { serverErrorsMail } from '@/server/mail/templates/server-errors'

const log = logger.child({ module: 'server-error-alerts' })

const MINUTE_MS = 60 * 1000

/**
 * Phase 14, item 10.1 (NFR-7, D-10) — someone hears about it.
 *
 * Run by the hourly job. A kind of fault (a fingerprint) that has rows and
 * that no email has named yet is announced, in one email to each person who
 * may read the error log (`errors.read`, decision 0043: the admin, and any
 * sub-admin granted it), and its rows are stamped `alertedAt`. A kind already
 * announced is not announced again however often it recurs; the Errors screen
 * counts it. A kind whose announced rows have all been pruned, and that is
 * still happening, is announced again: a month of it is worth a second email.
 *
 * At most one email in each `SERVER_ERRORS.alertEveryMinutes`, counted in
 * windows that start on the hour, whatever starts the job: a run by hand
 * after the scheduled one sends nothing, and a scheduled run that GitHub
 * starts late still sends in its own hour. Kinds that wait are named by the
 * next run. If nobody may read the log, or every send fails, nothing is
 * stamped, and the next run tries again.
 *
 * Plain functions over a database client and a clock, like the digests, so
 * the tests can run an hour in a second.
 */
export async function alertNewServerErrors(
  db: PrismaClient,
  now: Date = new Date(),
  options: { mailer?: Mailer } = {},
): Promise<{ kinds: number; sent: number }> {
  const windowMs = SERVER_ERRORS.alertEveryMinutes * MINUTE_MS
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs)
  const latest = await db.serverError.aggregate({ _max: { alertedAt: true } })
  if (latest._max.alertedAt && latest._max.alertedAt >= windowStart) return { kinds: 0, sent: 0 }

  // Kinds with no announced row, the oldest first: the order they happened in.
  const fresh = await db.$queryRaw<Array<{ fingerprint: string; count: number; firstSeen: Date }>>`
    SELECT "fingerprint", COUNT(*)::int AS "count", MIN("createdAt") AS "firstSeen"
    FROM "ServerError"
    GROUP BY "fingerprint"
    HAVING BOOL_AND("alertedAt" IS NULL)
    ORDER BY MIN("createdAt") ASC`
  if (fresh.length === 0) return { kinds: 0, sent: 0 }

  const people = await db.user.findMany({
    where: {
      role: { in: ['ADMIN', 'SUB_ADMIN'] },
      status: 'ACTIVE',
      deletionRequestedAt: null,
      emailVerifiedAt: { not: null },
      email: { not: { endsWith: '.invalid' } },
    },
    select: {
      email: true,
      role: true,
      status: true,
      deletionRequestedAt: true,
      adminGrants: { select: { capability: true } },
    },
  })
  // The rule is `canAdmin`'s, not this query's: whoever may open the Errors
  // screen is whoever is told.
  const recipients = people.filter((person) =>
    canAdmin(
      {
        role: person.role,
        status: person.status,
        deletionRequestedAt: person.deletionRequestedAt,
        grants: person.adminGrants.map((grant) => grant.capability),
      },
      'errors.read',
    ),
  )
  if (recipients.length === 0) {
    log.warn(
      { event: 'server_errors.nobody_to_tell', kinds: fresh.length },
      'new kinds of server error, and nobody who may read the error log',
    )
    return { kinds: fresh.length, sent: 0 }
  }

  const listed = fresh.slice(0, SERVER_ERRORS.pageKinds)
  const newest = await db.serverError.findMany({
    where: { fingerprint: { in: listed.map((kind) => kind.fingerprint) } },
    orderBy: { createdAt: 'desc' },
    distinct: ['fingerprint'],
    select: { fingerprint: true, source: true, location: true, name: true, message: true },
  })
  const byFingerprint = new Map(newest.map((row) => [row.fingerprint, row]))
  const kinds = listed.flatMap((kind) => {
    const row = byFingerprint.get(kind.fingerprint)
    if (!row) return []
    return [
      {
        source: row.source,
        location: row.location,
        name: row.name,
        message: row.message,
        count: kind.count,
        firstSeen: `${formatInZone(kind.firstSeen, 'dateTime', 'UTC')} UTC`,
      },
    ]
  })

  const mailer = options.mailer ?? getMailer()
  const errorsUrl = `${env.NEXT_PUBLIC_APP_URL}/admin/errors`
  let sent = 0
  for (const recipient of recipients) {
    try {
      await mailer.send(
        serverErrorsMail({
          to: recipient.email,
          kinds,
          more: fresh.length - kinds.length,
          errorsUrl,
        }),
      )
      sent += 1
    } catch (error) {
      log.error(
        { event: 'server_errors.alert_failed', error: String(error) },
        'an administrator was not told about new server errors; the next run tries again',
      )
    }
  }

  if (sent > 0) {
    await db.serverError.updateMany({
      where: { fingerprint: { in: fresh.map((kind) => kind.fingerprint) }, alertedAt: null },
      data: { alertedAt: now },
    })
  }
  log.info(
    { event: 'server_errors.alerted', kinds: fresh.length, sent },
    'administrators told about new kinds of server error',
  )
  return { kinds: fresh.length, sent }
}
