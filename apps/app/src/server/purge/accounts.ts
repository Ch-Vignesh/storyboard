import 'server-only'

import type { PrismaClient } from '@storyboard/db'

import { logger } from '@/lib/logger'
import { ACCOUNT_DELETION_GRACE_DAYS } from '@/lib/schemas/constants'
import { recordEvent } from '@/server/audit'
import { getMailer, type Mailer } from '@/server/mail/mailer'
import { accountDeletedMail } from '@/server/mail/templates/account-deletion'
import { retiredUsernameHash } from '@/server/retired-usernames'
import { deleteObject } from '@/server/storage'

/**
 * What "delete my account" finally means (OD-3's second half, decision 0024).
 *
 * The row stays. Every identifying column on it is destroyed.
 *
 * That is the whole design, and it is the opposite of what "delete" usually
 * implies, so it is worth being plain about why. This person's `User` row is
 * what their revisions, their credits, their suggestions, their storyboards and
 * other people's storyboards all point at. Those things are not only theirs: a
 * co-author's chapter contains revisions this person wrote, and a contributor's
 * credit sits on a storyboard this person owns. Deleting the row would take
 * somebody else's work with it — which is exactly the failure decision 0019
 * caught in spin-offs, where a shared row crossing an ownership boundary meant
 * one person's delete silently emptied another person's manuscript.
 *
 * So the personal data goes and the anchor stays. Afterwards `nameOf()` renders
 * the anchor as "a former member" and `hasProfile()` refuses to link to it,
 * with no change at any call site, because that is already how an erased
 * contributor is drawn (decision 0013).
 *
 * **What is deliberately not touched here.** Nothing is nulled by hand that a
 * foreign key already handles, and no revision is updated — the NFR-3 trigger
 * refuses every UPDATE on `Revision` whatever hatch is open, and the phase 6
 * audit found a purge job that had been quietly failing for a release because
 * it asked anyway.
 */

const log = logger.child({ module: 'purge.accounts' })

/** Reserved by RFC 2606 and undeliverable, which is the point. */
function tombstoneEmail(userId: string): string {
  return `deleted-${userId}@deleted.invalid`
}

export async function purgeDeletedAccounts(
  db: PrismaClient,
  now = new Date(),
  mailer: Mailer = getMailer(),
): Promise<{ considered: number; purged: number }> {
  const cutoff = new Date(now.getTime() - ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000)

  const due = await db.user.findMany({
    where: {
      deletionRequestedAt: { not: null, lt: cutoff },
      // Already stripped: `status` is the flag, and only this purge sets it.
      // It used to be `username: { not: null }`, which also skipped everyone
      // who asked to be deleted before choosing a username: their address,
      // password and name were kept for ever (phase 12 audit).
      status: { not: 'DELETED' },
    },
    select: { id: true },
  })

  let purged = 0
  for (const user of due) {
    try {
      if (!(await purgeOne(db, user.id, mailer, cutoff))) {
        log.info({ event: 'purge.account.kept', userId: user.id }, 'kept before it was erased')
        continue
      }
      purged += 1
      // No username or email in this line, deliberately. A log that records
      // what was erased has not erased it.
      log.warn(
        { event: 'purge.account', userId: user.id },
        'account passed its grace and was erased',
      )
      // Item 10.2 — stored as well as logged, by id alone, as the line is.
      await recordEvent(db, {
        event: 'purge.account',
        actorId: null,
        target: { type: 'USER', id: user.id },
      })
    } catch (error) {
      // One bad row must not stop the rest; it is retried tomorrow.
      log.error(
        { event: 'purge.account.failed', userId: user.id, error: String(error) },
        'could not erase an account',
      )
    }
  }

  return { considered: due.length, purged }
}

/** Still asked to be erased, past its grace, and not erased yet. */
type Standing = { deletionRequestedAt: Date | null; status: string }
function stillDue(row: Standing | null | undefined, cutoff: Date): boolean {
  return (
    !!row &&
    row.status !== 'DELETED' &&
    row.deletionRequestedAt !== null &&
    row.deletionRequestedAt < cutoff
  )
}

/**
 * True if the account was erased. False if it was kept in the meantime: the
 * list of due accounts is read once at the start of the run, and somebody who
 * pressed "Keep my account" on their last day, while the run was still on
 * earlier accounts, was erased anyway (2026-10-26 final pass). Checked again
 * before anything is touched, and once more under the row's lock inside the
 * transaction, so a keep that lands first wins.
 */
async function purgeOne(
  db: PrismaClient,
  userId: string,
  mailer: Mailer,
  cutoff: Date,
): Promise<boolean> {
  // The address, read before it is replaced below. The last message goes to
  // it once the erasure has happened, so that what it says is true (phase 14,
  // item 1.5).
  const before = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, username: true, deletionRequestedAt: true, status: true },
  })
  if (!before || !stillDue(before, cutoff)) return false

  // Their uploaded manuscripts, before the rows that say where they are.
  // Best-effort and outside the transaction: an object store being briefly
  // unreachable must not stop the personal data in the database being erased,
  // and the files are re-findable from the log if it does.
  const jobs = await db.importJob.findMany({ where: { userId }, select: { fileKey: true } })
  for (const job of jobs) {
    if (!(await deleteObject(job.fileKey))) {
      log.error(
        { event: 'purge.account.upload', userId },
        'could not remove an uploaded manuscript; the database row goes anyway',
      )
    }
  }

  const erased = await db.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<Standing[]>`
      select "deletionRequestedAt", "status"::text as "status"
      from "User" where id = ${userId} for update
    `
    if (!stillDue(locked, cutoff)) return false

    // Everything that exists only to identify this person, reach them, or
    // remember what they liked — and that belongs to nobody else.
    //
    // What is *not* here is the point: credits, revisions, suggestions, ideas,
    // requests, storyboards and the reports they filed all stay. Each is either
    // their contribution to somebody else's work or somebody else's record of
    // theirs, and "all their work stays" is the decision (0024).
    await tx.emailVerificationToken.deleteMany({ where: { userId } }) // credentials
    await tx.passwordResetToken.deleteMany({ where: { userId } }) // FR-1.7 links
    await tx.notification.deleteMany({ where: { userId } }) // addressed to them
    await tx.notificationPreference.deleteMany({ where: { userId } }) // a preference
    await tx.sectionDraft.deleteMany({ where: { userId } }) // unsaved, unshared
    await tx.userGenre.deleteMany({ where: { userId } }) // a preference
    await tx.activityDay.deleteMany({ where: { userId } }) // when they were here
    await tx.importJob.deleteMany({ where: { userId } }) // their filenames
    await tx.subAdminGrant.deleteMany({ where: { userId } }) // a sub-admin's doors (0043)
    await tx.userAvatar.deleteMany({ where: { userId } }) // their picture (item 3.13)

    // An access grant, not a credit. `can()` already refuses a DELETED actor,
    // but an account that has been erased should not still be on the member
    // list of somebody's unpublished manuscript — and defence that relies on a
    // single status check staying correct forever is thin.
    await tx.collaborator.deleteMany({ where: { userId } })

    await tx.user.update({
      where: { id: userId },
      data: {
        status: 'DELETED',
        // Unique columns need a value, not null, and the value must not be
        // derived from anything they gave us.
        email: tombstoneEmail(userId),
        username: null,
        displayName: null,
        bio: null,
        avatarUrl: null,
        passwordHash: null,
        emailVerifiedAt: null,
        // A power, not an identity, but nobody is left to hold it.
        isAdmin: false,
        role: 'USER',
        // An administrator's note about the person goes with the person (item 2b.5).
        standingNote: null,
      },
    })

    // Decision 0042 (item 1.6) — the name stays retired. Its hash, in the
    // same transaction, so an erasure and its retirement stand or fall
    // together.
    if (before?.username) {
      const hash = retiredUsernameHash(before.username)
      await tx.retiredUsername.upsert({ where: { hash }, create: { hash }, update: {} })
    }
    return true
  })
  if (!erased) return false

  try {
    await mailer.send(accountDeletedMail({ to: before.email }))
  } catch (error) {
    // The erasure stands; the message was a courtesy. No address in the log.
    log.error(
      { event: 'purge.account.mail_failed', userId, error: String(error) },
      'could not send the last message to an erased account',
    )
  }
  return true
}
