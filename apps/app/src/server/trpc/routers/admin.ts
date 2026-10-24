import type { Prisma, PrismaClient } from '@storyboard/db'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { canAdmin, GRANTABLE_CAPABILITIES } from '@/lib/authz/admin'
import { forgetFlags } from '@/lib/flags'
import { logger } from '@/lib/logger'
import {
  ACCOUNT_DELETION_GRACE_DAYS,
  AUDIT_LOG,
  FEATURE_FLAG_DESCRIPTIONS,
  FEATURE_FLAG_KEYS,
  REPORT_QUEUE_PAGE,
  REPORTS_TO_SUSPEND,
  SEED_TARGETS,
  STANDING_NOTE_MAX_CHARS,
} from '@/lib/schemas/constants'
import { reportCategorySchema } from '@/lib/schemas/report'
import { nameOf } from '@/lib/people'
import { usernameSchema } from '@/lib/schemas/auth'
import { contactAddress } from '@/lib/site'
import { formatInZone, timeZoneFromCookieHeader } from '@/lib/time-zone'
import {
  countReportsAgainst,
  describeAccount,
  refuseIfUntouchable,
  suspendsForReports,
} from '@/server/account-standing'
import { overviewCounts } from '@/server/admin-overview'
import { setHiddenState } from '@/server/hidden'
import { afterResponse } from '@/server/after-response'
import { getMailer } from '@/server/mail/mailer'
import { deletionByAdminMail } from '@/server/mail/templates/account-deletion'
import { auditEvents, recordEvent } from '@/server/audit'
import { banUsername, unbanUsername } from '@/server/retired-usernames'
import { serverErrorKinds } from '@/server/server-errors'

import { type Account, adminProcedure, createTRPCRouter } from '../init'

const log = logger.child({ router: 'admin' })

/** The note left with a suspension, ban or deletion (item 2b.5): empty is none. */
const noteSchema = z
  .string()
  .trim()
  .max(STANDING_NOTE_MAX_CHARS)
  .optional()
  .transform((value) => (value?.length ? value : null))

/**
 * FR-13.7 and FR-15.5 — moderation is the owner's own time in v1.
 *
 * Everything here is designed around that sentence. The queue is one list with
 * two decisions per row, the decisions are reversible, and nothing asks the
 * moderator to write anything. A moderation tool that needs a training document
 * is a tool that will not be used at eleven at night by the one person who has
 * to use it.
 *
 * Every procedure is `adminProcedure(capability)`, which 404s anyone without
 * that capability (decision 0043) rather than forbidding them: an admin screen
 * is not a thing to be told about.
 */
export const adminRouter = createTRPCRouter({
  /** Decision 0043 (item 2b.4) — the numbers the admin opens on. Counts, never pages. */
  overview: adminProcedure('overview.read').query(({ ctx }) => overviewCounts(ctx.db, new Date())),

  /**
   * The queue. Open reports first, oldest first — a queue, not a feed.
   *
   * Item 9.3 — a page at a time (`REPORT_QUEUE_PAGE`), the next one by
   * cursor: a queue that stopped at its first fifty hid the fifty-first from
   * the one person working it. The cursor is the last report's time and id,
   * so deciding a report does not lose the place of the ones after it.
   */
  reports: adminProcedure('reports.decide')
    .input(
      z.object({
        state: z.enum(['OPEN', 'UPHELD', 'DISMISSED']).default('OPEN'),
        cursor: z.object({ at: z.date(), id: z.string().min(1).max(64) }).nullish(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // The open queue is worked oldest first; the upheld and dismissed
      // lists are histories, read newest first (found by flow 8 once a
      // database had more upheld reports than one page shows). The id breaks
      // a tie, so a cursor is exact.
      const oldestFirst = input.state === 'OPEN'
      const direction = oldestFirst ? 'asc' : 'desc'
      const after = input.cursor
      const rows = await ctx.db.report.findMany({
        where: {
          state: input.state,
          ...(after
            ? {
                OR: [
                  { createdAt: oldestFirst ? { gt: after.at } : { lt: after.at } },
                  { createdAt: after.at, id: oldestFirst ? { gt: after.id } : { lt: after.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: direction }, { id: direction }],
        take: REPORT_QUEUE_PAGE + 1,
        select: {
          id: true,
          targetType: true,
          targetId: true,
          category: true,
          note: true,
          state: true,
          createdAt: true,
          resolvedAt: true,
          reporter: { select: { id: true, username: true, displayName: true } },
          resolvedBy: { select: { username: true, displayName: true } },
        },
      })
      const reports = rows.slice(0, REPORT_QUEUE_PAGE)
      const last = reports.at(-1)

      // What each report is actually about, resolved here rather than in the
      // component: a moderator should not have to open four tabs to see what
      // they are deciding on.
      const detailed = await Promise.all(
        reports.map(async (report) => ({
          ...report,
          reporterName: nameOf(report.reporter),
          subject: await describe(ctx.db, report.targetType, report.targetId),
        })),
      )

      const counts = await ctx.db.report.groupBy({ by: ['state'], _count: { _all: true } })

      return {
        reports: detailed,
        counts: Object.fromEntries(counts.map((row) => [row.state, row._count._all])),
        nextCursor:
          rows.length > REPORT_QUEUE_PAGE && last ? { at: last.createdAt, id: last.id } : null,
      }
    }),

  /**
   * Uphold or dismiss. One key each in the interface, and reversible: FR-13.7
   * says suspension is reversible, and a decision you cannot undo is one people
   * hesitate over, which makes the queue longer.
   *
   * Upholding is what counts towards FR-13.5's ten. Filing does not.
   */
  decide: adminProcedure('reports.decide')
    .input(
      z.object({
        reportId: z.string().min(1),
        decision: z.enum(['UPHELD', 'DISMISSED', 'OPEN']),
        /** Item 2.7 — "Uphold and hide": the thing reported goes with the decision. */
        hide: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const adminId = ctx.session.user.id

      const report = await ctx.db.report.findUnique({
        where: { id: input.reportId },
        select: { id: true, targetType: true, targetId: true, state: true, category: true },
      })
      if (!report) throw new TRPCError({ code: 'NOT_FOUND', message: 'No such report.' })

      await ctx.db.report.update({
        where: { id: report.id },
        data:
          input.decision === 'OPEN'
            ? { state: 'OPEN', resolvedAt: null, resolvedById: null }
            : { state: input.decision, resolvedAt: new Date(), resolvedById: adminId },
      })

      // Item 2.7 (decision 0045) — hidden with the report's category as the
      // reason, until "Show it again". Never a person: an account is
      // suspended, not hidden.
      let hidden = false
      if (input.decision === 'UPHELD' && input.hide && report.targetType !== 'USER') {
        hidden = await setHiddenState(
          ctx.db,
          { type: report.targetType, id: report.targetId },
          { hidden: true, byId: adminId, reason: report.category },
        )
        log.warn(
          {
            event: 'admin.content_hidden',
            targetType: report.targetType,
            targetId: report.targetId,
            reportId: report.id,
            adminId,
          },
          'content hidden after a report',
        )
        // Item 10.2 (NFR-7, decision 0043) — each admin action stored as well as logged.
        await recordEvent(ctx.db, {
          event: 'admin.content_hidden',
          actorId: adminId,
          target: { type: report.targetType, id: report.targetId },
          detail: { reportId: report.id, reason: report.category },
        })
      }

      // FR-13.5 — ten upheld against one person suspends them pending review.
      // Counted against the *person*, which is why reports resolve to an owner.
      const subject = await subjectUserId(ctx.db, report.targetType, report.targetId)
      let suspended = false
      if (subject && input.decision === 'UPHELD') {
        const upheld = await countReportsAgainst(ctx.db, subject, 'UPHELD')
        if (upheld >= REPORTS_TO_SUSPEND) {
          const user = await ctx.db.user.findUnique({
            where: { id: subject },
            select: { status: true, role: true },
          })
          if (suspendsForReports(user)) {
            await ctx.db.user.update({
              where: { id: subject },
              data: { status: 'SUSPENDED', suspendedAt: new Date(), suspendedById: adminId },
            })
            suspended = true
            log.warn(
              { event: 'admin.auto_suspended', userId: subject, upheld },
              'account suspended by upheld report count',
            )
            await recordEvent(ctx.db, {
              event: 'admin.auto_suspended',
              actorId: adminId,
              target: { type: 'USER', id: subject },
              detail: { upheld },
            })
          } else if (user?.role === 'ADMIN') {
            // Decision 0043 — the one person who runs the place is not locked
            // out of it by reports; the count is logged for whoever reads them.
            log.warn(
              { event: 'admin.auto_suspend_skipped', userId: subject, upheld },
              'ten upheld reports against the administrator',
            )
          }
        }
      }

      log.info(
        { event: 'admin.report_decided', reportId: report.id, decision: input.decision, adminId },
        'report decided',
      )
      await recordEvent(ctx.db, {
        event: 'admin.report_decided',
        actorId: adminId,
        subjectId: subject,
        target: { type: report.targetType, id: report.targetId },
        detail: { reportId: report.id, decision: input.decision, category: report.category },
      })
      return { decision: input.decision, suspended, hidden }
    }),

  /**
   * Suspend or lift by hand (FR-13.7 — reversible, and it says who did it),
   * with a note for the People screen (item 2b.5). A ban is lifted by
   * `unban`, never here: that is what makes it a ban.
   */
  setUserStatus: adminProcedure('accounts.suspend')
    .input(
      z.object({
        userId: z.string().min(1),
        status: z.enum(['ACTIVE', 'SUSPENDED']),
        note: noteSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const adminId = ctx.session.user.id
      const target = await touchable(ctx, input.userId)
      if (input.status === 'ACTIVE' && target.bannedAt) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'That account is banned. Lift the ban instead.',
        })
      }

      const user = await ctx.db.user.update({
        where: { id: target.id },
        data:
          input.status === 'SUSPENDED'
            ? {
                status: 'SUSPENDED',
                suspendedAt: new Date(),
                suspendedById: adminId,
                standingNote: input.note,
              }
            : { status: 'ACTIVE', suspendedAt: null, suspendedById: null, standingNote: null },
        select: { id: true, username: true, displayName: true, status: true },
      })

      log.warn(
        { event: 'admin.user_status', userId: user.id, status: input.status, adminId },
        'account status changed by hand',
      )
      // The note stays on the account, for administrators; the event says what was done.
      await recordEvent(ctx.db, {
        event: 'admin.user_status',
        actorId: adminId,
        target: { type: 'USER', id: user.id },
        detail: { status: input.status },
      })
      // Decision 0018 — the work is untouched. Nothing else happens here.
      return user
    }),

  /**
   * Decision 0043 (item 2b.5) — a ban: a suspension that neither the report
   * review nor "Lift the suspension" undoes. Only `unban` does.
   */
  ban: adminProcedure('accounts.suspend')
    .input(
      z.object({
        userId: z.string().min(1),
        note: noteSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const adminId = ctx.session.user.id
      const target = await touchable(ctx, input.userId)
      const now = new Date()
      const user = await ctx.db.user.update({
        where: { id: target.id },
        data: {
          status: 'SUSPENDED',
          suspendedAt: target.suspendedAt ?? now,
          suspendedById: adminId,
          bannedAt: now,
          standingNote: input.note,
        },
        select: { id: true, username: true, displayName: true, status: true, bannedAt: true },
      })
      log.warn({ event: 'admin.user_banned', userId: user.id, adminId }, 'account banned')
      await recordEvent(ctx.db, {
        event: 'admin.user_banned',
        actorId: adminId,
        target: { type: 'USER', id: user.id },
      })
      return user
    }),

  /**
   * Lifts a ban, and the suspension with it. A deletion that came with the
   * ban (`deleteAccount`) is stopped too: lifting the ban says the decision
   * was wrong, and the deletion was part of it.
   */
  unban: adminProcedure('accounts.suspend')
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const adminId = ctx.session.user.id
      const target = await touchable(ctx, input.userId)
      if (!target.bannedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'That account is not banned.' })
      }
      const user = await ctx.db.user.update({
        where: { id: target.id },
        data: {
          status: 'ACTIVE',
          suspendedAt: null,
          suspendedById: null,
          bannedAt: null,
          standingNote: null,
          deletionRequestedAt: null,
        },
        select: { id: true, username: true, displayName: true, status: true },
      })
      log.warn({ event: 'admin.user_unbanned', userId: user.id, adminId }, 'ban lifted')
      await recordEvent(ctx.db, {
        event: 'admin.user_unbanned',
        actorId: adminId,
        target: { type: 'USER', id: user.id },
      })
      return user
    }),

  /**
   * Decision 0043 (item 2b.5) — deletes an account the way the person could
   * have (decision 0024): frozen at once, erased by the purge after the grace
   * period, the writing kept as a former member's. Frozen as a ban, so the
   * person cannot keep the account from the settings; the notice to the
   * address says where to write instead. The note stays inside.
   */
  deleteAccount: adminProcedure('accounts.delete')
    .input(
      z.object({
        userId: z.string().min(1),
        note: noteSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const adminId = ctx.session.user.id
      const target = await touchable(ctx, input.userId)
      const now = new Date()
      // A deletion the person had already asked for keeps its earlier date.
      const requestedAt = target.deletionRequestedAt ?? now
      const finishesAt = new Date(requestedAt.getTime() + ACCOUNT_DELETION_GRACE_DAYS * DAY_MS)
      await ctx.db.user.update({
        where: { id: target.id },
        data: {
          status: 'SUSPENDED',
          suspendedAt: target.suspendedAt ?? now,
          suspendedById: adminId,
          bannedAt: target.bannedAt ?? now,
          standingNote: input.note,
          deletionRequestedAt: requestedAt,
        },
      })

      const mailer = getMailer()
      const mail = deletionByAdminMail({
        to: target.email,
        finishesOn: formatInZone(
          finishesAt,
          'long',
          timeZoneFromCookieHeader(ctx.headers.get('cookie')),
        ),
        supportAddress: contactAddress(),
      })
      await afterResponse(async () => {
        try {
          await mailer.send(mail)
        } catch (error) {
          log.error(
            { event: 'admin.deletion.mail_failed', userId: target.id, error: String(error) },
            'could not send the deletion notice',
          )
        }
      })
      log.warn(
        { event: 'admin.account_deleted', userId: target.id, adminId },
        'account deletion scheduled by an administrator',
      )
      await recordEvent(ctx.db, {
        event: 'admin.account_deleted',
        actorId: adminId,
        target: { type: 'USER', id: target.id },
      })
      return { finishesAt }
    }),

  /** Who this is, how they stand, and what has been reported against them (item 2b.5). */
  user: adminProcedure('accounts.suspend')
    .input(z.object({ userId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const user = await describeAccount(ctx.db, input.userId, viewerOf(ctx))
      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'No such person.' })
      return user
    }),

  /**
   * Item 2b.5 — an account by its exact username or email address. Null when
   * nobody has it: not finding a person is an ordinary outcome, not an error.
   * Exact, because a search over members would be a browsing tool, and this
   * is not one.
   */
  findAccount: adminProcedure('accounts.suspend')
    .input(z.object({ query: z.string().trim().min(1).max(320) }))
    .query(async ({ ctx, input }) => {
      const query = input.query.replace(/^@/u, '')
      const match = await ctx.db.user.findFirst({
        where: query.includes('@')
          ? { email: { equals: query, mode: 'insensitive' } }
          : { username: { equals: query, mode: 'insensitive' } },
        select: { id: true },
      })
      return match ? describeAccount(ctx.db, match.id, viewerOf(ctx)) : null
    }),

  /**
   * FR-13.5 — every suspended account, so a suspension can be reviewed and
   * lifted. `setUserStatus` could lift one, and nothing listed them or called
   * it, until the 2026-10-16 spec review: "suspended pending review" had no
   * review.
   */
  suspended: adminProcedure('accounts.suspend').query(async ({ ctx }) => {
    const users = await ctx.db.user.findMany({
      where: { status: 'SUSPENDED' },
      orderBy: { suspendedAt: 'desc' },
      select: {
        id: true,
        username: true,
        displayName: true,
        suspendedAt: true,
        bannedAt: true,
        standingNote: true,
        // Null when the ten upheld reports did it rather than a person.
        suspendedBy: { select: { username: true, displayName: true } },
      },
    })
    return Promise.all(
      users.map(async (user) => ({
        ...user,
        upheld: await countReportsAgainst(ctx.db, user.id, 'UPHELD'),
      })),
    )
  }),

  /** FR-15.5 — the seeded-content manager. What is seeded, and is it labelled. */
  seeded: adminProcedure('seeds.manage').query(async ({ ctx }) => {
    const storyboards = await ctx.db.storyboard.findMany({
      where: { isSeed: true },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        slug: true,
        title: true,
        visibility: true,
        state: true,
        createdAt: true,
        owner: { select: { username: true, displayName: true } },
        genres: { select: { genre: { select: { name: true } } } },
        _count: { select: { versions: true } },
      },
    })

    // FR-15.4's targets, so the screen can say how far off launch is.
    const genres = new Set(
      storyboards.flatMap((storyboard) => storyboard.genres.map((entry) => entry.genre.name)),
    )
    // "Open" is still taking suggestions, which an answered request is too;
    // "answered" is FR-15.4's "showing accepted suggestions", a resolved one.
    // The gauge counted only the first state of each until the 2026-10-16
    // spec review, so every answered seed request moved from one to the other.
    const seeded = { section: { chapter: { version: { storyboard: { isSeed: true } } } } }
    const openRequests = await ctx.db.contributionRequest.count({
      where: { state: { in: ['OPEN', 'ANSWERED'] }, ...seeded },
    })
    const answered = await ctx.db.contributionRequest.count({
      where: { state: 'RESOLVED', ...seeded },
    })
    // Phase 14, item 9.5 — rewrites still open, which the library once had none of.
    const openRewrites = await ctx.db.contributionRequest.count({
      where: { kind: 'REWRITE', state: { in: ['OPEN', 'ANSWERED'] }, ...seeded },
    })

    return {
      storyboards,
      progress: {
        storyboards: { have: storyboards.length, want: SEED_TARGETS.storyboards },
        genres: { have: genres.size, want: SEED_TARGETS.genres },
        openRequests: { have: openRequests, want: SEED_TARGETS.openRequests },
        answeredRequests: { have: answered, want: SEED_TARGETS.answeredRequests },
        openRewrites: { have: openRewrites, want: SEED_TARGETS.openRewrites },
      },
    }
  }),

  /**
   * FR-15.5 with D-18 (item 9.4) — the known switches, each with where it
   * stands and who last threw it. Known means listed in `FEATURE_FLAG_KEYS`,
   * which is what `lib/flags.ts` reads: a switch nothing reads is not offered,
   * and one not seeded yet is shown off, as it is.
   */
  flags: adminProcedure('flags.toggle').query(async ({ ctx }) => {
    const rows = await ctx.db.featureFlag.findMany({
      where: { key: { in: [...FEATURE_FLAG_KEYS] } },
      select: {
        key: true,
        enabled: true,
        updatedAt: true,
        updatedBy: { select: { username: true, displayName: true } },
      },
    })
    return FEATURE_FLAG_KEYS.map((key) => {
      const row = rows.find((candidate) => candidate.key === key)
      return {
        key,
        description: FEATURE_FLAG_DESCRIPTIONS[key],
        enabled: row?.enabled ?? false,
        // The seed writes a row nobody threw; only a person's switch is news.
        changedAt: row?.updatedBy ? row.updatedAt : null,
        changedBy: row?.updatedBy ? nameOf(row.updatedBy) : null,
      }
    })
  }),

  /** Item 9.4 — a known switch, on or off. The words are the list's, not typed here. */
  setFlag: adminProcedure('flags.toggle')
    .input(z.object({ key: z.enum(FEATURE_FLAG_KEYS), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const description = FEATURE_FLAG_DESCRIPTIONS[input.key]
      const flag = await ctx.db.featureFlag.upsert({
        where: { key: input.key },
        create: {
          key: input.key,
          enabled: input.enabled,
          description,
          updatedById: ctx.session.user.id,
        },
        update: { enabled: input.enabled, description, updatedById: ctx.session.user.id },
        select: { key: true, enabled: true },
      })
      // This instance obeys at once; the others within `FLAG_CACHE_SECONDS`.
      forgetFlags(input.key)
      log.info(
        {
          event: 'admin.flag_set',
          key: flag.key,
          enabled: flag.enabled,
          adminId: ctx.session.user.id,
        },
        'feature flag changed',
      )
      await recordEvent(ctx.db, {
        event: 'admin.flag_set',
        actorId: ctx.session.user.id,
        subjectId: null,
        storyboardId: null,
        target: { type: 'FLAG', id: flag.key },
        detail: { enabled: flag.enabled },
      })
      return flag
    }),

  /**
   * Decision 0043 (item 2b.3) — the admin alone makes a user a sub-admin, or a
   * sub-admin a user again. The admin's own role is set from the command line
   * and never here; and there is only one admin, so "the admin" and "yourself"
   * are the same account. Demotion takes the grants with it.
   */
  setRole: adminProcedure('roles.manage')
    .input(z.object({ userId: z.string().min(1), role: z.enum(['USER', 'SUB_ADMIN']) }))
    .mutation(async ({ ctx, input }) => {
      const adminId = ctx.session.user.id
      if (input.userId === adminId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Your own role is set from the command line.',
        })
      }
      const target = await ctx.db.user.findUnique({
        where: { id: input.userId },
        select: { role: true, status: true },
      })
      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'No such account.' })
      if (target.role === 'ADMIN') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: "The administrator's role is set from the command line.",
        })
      }
      if (target.status === 'DELETED') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'That account has been deleted.' })
      }

      const user = await ctx.db.$transaction(async (tx) => {
        if (input.role === 'USER') {
          await tx.subAdminGrant.deleteMany({ where: { userId: input.userId } })
        }
        return tx.user.update({
          // Checked again inside the transaction: the one row that may not change.
          where: { id: input.userId, role: { not: 'ADMIN' } },
          data: { role: input.role },
          select: { id: true, username: true, displayName: true, role: true },
        })
      })
      log.warn(
        { event: 'admin.role_set', userId: user.id, role: user.role, adminId },
        'role changed',
      )
      await recordEvent(ctx.db, {
        event: 'admin.role_set',
        actorId: adminId,
        target: { type: 'USER', id: user.id },
        detail: { role: user.role },
      })
      return user
    }),

  /**
   * A sub-admin's grants, replaced as a set, by the admin alone. The input
   * schema refuses a name outside the grantable list, so `roles.manage` cannot
   * be written whatever the caller sends.
   */
  setGrants: adminProcedure('roles.manage')
    .input(
      z.object({
        userId: z.string().min(1),
        capabilities: z.array(z.enum(GRANTABLE_CAPABILITIES)).max(GRANTABLE_CAPABILITIES.length),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const adminId = ctx.session.user.id
      const target = await ctx.db.user.findUnique({
        where: { id: input.userId },
        select: { role: true },
      })
      if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'No such account.' })
      if (target.role !== 'SUB_ADMIN') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only a sub-admin holds grants. Make them one first.',
        })
      }

      const wanted = [...new Set(input.capabilities)]
      await ctx.db.$transaction(async (tx) => {
        await tx.subAdminGrant.deleteMany({
          where: { userId: input.userId, capability: { notIn: wanted } },
        })
        for (const capability of wanted) {
          await tx.subAdminGrant.upsert({
            where: { userId_capability: { userId: input.userId, capability } },
            create: { userId: input.userId, capability, grantedById: adminId },
            update: {},
          })
        }
      })
      log.warn(
        { event: 'admin.grants_set', userId: input.userId, capabilities: wanted, adminId },
        'sub-admin grants changed',
      )
      await recordEvent(ctx.db, {
        event: 'admin.grants_set',
        actorId: adminId,
        target: { type: 'USER', id: input.userId },
        detail: { capabilities: wanted },
      })
      return { userId: input.userId, capabilities: wanted }
    }),

  /**
   * Decision 0043 (item 2b.6) — the banned names, newest first. Retired names
   * are not listed: they are hashes (decision 0042).
   */
  bannedNames: adminProcedure('names.ban').query(({ ctx }) =>
    ctx.db.retiredUsername.findMany({
      where: { reason: 'BANNED' },
      orderBy: { retiredAt: 'desc' },
      select: { name: true, note: true, retiredAt: true },
    }),
  ),

  /**
   * Bans a username nobody holds: the username step refuses it with the
   * taken-name sentence, as it does a retired one. A name an account holds is
   * refused here (ban the account, from People); a name already unavailable
   * is left as it is, and nothing says why it is unavailable.
   */
  banName: adminProcedure('names.ban')
    .input(z.object({ name: usernameSchema, note: noteSchema }))
    .mutation(async ({ ctx, input }) => {
      const adminId = ctx.session.user.id
      const held = await ctx.db.user.findFirst({
        where: { username: { equals: input.name, mode: 'insensitive' } },
        select: { id: true },
      })
      if (held) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'An account has that name. Ban the account instead, from People.',
        })
      }
      const row = await banUsername(ctx.db, input.name, input.note)
      if (!row) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'That name is already unavailable.' })
      }
      log.warn({ event: 'admin.name_banned', name: input.name, adminId }, 'username banned')
      await recordEvent(ctx.db, {
        event: 'admin.name_banned',
        actorId: adminId,
        subjectId: null,
        storyboardId: null,
        target: { type: 'NAME', id: input.name },
      })
      return row
    }),

  unbanName: adminProcedure('names.ban')
    .input(z.object({ name: usernameSchema }))
    .mutation(async ({ ctx, input }) => {
      const lifted = await unbanUsername(ctx.db, input.name)
      if (!lifted) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'That name is not banned.' })
      }
      log.warn(
        { event: 'admin.name_unbanned', name: input.name, adminId: ctx.session.user.id },
        'username ban lifted',
      )
      await recordEvent(ctx.db, {
        event: 'admin.name_unbanned',
        actorId: ctx.session.user.id,
        subjectId: null,
        storyboardId: null,
        target: { type: 'NAME', id: input.name },
      })
      return { name: input.name }
    }),

  /**
   * Item 2.7 (decision 0045) — hide what a report was about, or show it
   * again. Reversible, and nothing is deleted: credit is permanent.
   */
  setHidden: adminProcedure('reports.decide')
    .input(
      z.object({
        targetType: z.enum(['STORYBOARD', 'SUGGESTION', 'IDEA']),
        targetId: z.string().min(1),
        hidden: z.boolean(),
        reason: reportCategorySchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const adminId = ctx.session.user.id
      const changed = await setHiddenState(
        ctx.db,
        { type: input.targetType, id: input.targetId },
        { hidden: input.hidden, byId: adminId, reason: input.reason ?? null },
      )
      if (!changed) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'That is not here any more.' })
      }
      log.warn(
        {
          event: input.hidden ? 'admin.content_hidden' : 'admin.content_shown',
          targetType: input.targetType,
          targetId: input.targetId,
          adminId,
        },
        input.hidden ? 'content hidden after a report' : 'content shown again',
      )
      await recordEvent(ctx.db, {
        event: input.hidden ? 'admin.content_hidden' : 'admin.content_shown',
        actorId: adminId,
        target: { type: input.targetType, id: input.targetId },
        detail: input.reason ? { reason: input.reason } : undefined,
      })
      return { hidden: input.hidden }
    }),

  /**
   * Phase 14, item 10.1 (D-10) — the server's own faults, one entry per kind,
   * the most recent first. Behind `errors.read` (decision 0043), which the
   * admin may grant a sub-admin; whoever holds it is emailed about new kinds.
   */
  errors: adminProcedure('errors.read').query(({ ctx }) => serverErrorKinds(ctx.db)),

  /**
   * Phase 14, item 10.2 (NFR-7) — the stored events, the newest first, a page
   * at a time, for a story, a person, both or neither. Behind `events.read`
   * (decision 0043).
   */
  events: adminProcedure('events.read')
    .input(
      z.object({
        story: z.string().trim().max(AUDIT_LOG.filterMaxChars).optional(),
        person: z.string().trim().max(AUDIT_LOG.filterMaxChars).optional(),
        cursor: z.string().min(1).optional(),
      }),
    )
    .query(({ ctx, input }) => auditEvents(ctx.db, input)),
})

type Db = PrismaClient | Prisma.TransactionClient

const DAY_MS = 24 * 60 * 60 * 1000

type AdminContext = { db: Db; session: { user: { id: string } }; account: Account }

/** Who is looking: grants are shown to the admin alone (decision 0043). */
function viewerOf(ctx: AdminContext): { id: string; seesGrants: boolean } {
  return { id: ctx.session.user.id, seesGrants: canAdmin(ctx.account, 'roles.manage') }
}

/**
 * Loads an account for an action on it, and refuses the ones nobody may act
 * on (item 2b.5): the administrator, yourself, another sub-admin unless you
 * are the admin, and an erased account (decision 0024).
 */
async function touchable(ctx: AdminContext, userId: string) {
  const target = await ctx.db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      status: true,
      email: true,
      suspendedAt: true,
      bannedAt: true,
      deletionRequestedAt: true,
    },
  })
  if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'No such account.' })
  refuseIfUntouchable({ id: ctx.session.user.id, role: ctx.account?.role ?? 'USER' }, target)
  return target
}

/** The person a report is about. */
async function subjectUserId(db: Db, targetType: string, targetId: string): Promise<string | null> {
  switch (targetType) {
    case 'USER':
      return targetId
    case 'STORYBOARD':
      return (
        (await db.storyboard.findUnique({ where: { id: targetId }, select: { ownerId: true } }))
          ?.ownerId ?? null
      )
    case 'SUGGESTION':
      return (
        (
          await db.suggestion.findUnique({
            where: { id: targetId },
            select: { contributorId: true },
          })
        )?.contributorId ?? null
      )
    case 'IDEA':
      return (
        (await db.idea.findUnique({ where: { id: targetId }, select: { authorId: true } }))
          ?.authorId ?? null
      )
    default:
      return null
  }
}

/**
 * A one-line description of what a report is about, for the queue, and
 * whether it is hidden (item 2.7). An account is never hidden: it is
 * suspended.
 */
async function describe(
  db: Db,
  targetType: string,
  targetId: string,
): Promise<{ label: string; href: string | null; excerpt: string | null; hidden: boolean }> {
  switch (targetType) {
    case 'USER': {
      const user = await db.user.findUnique({
        where: { id: targetId },
        select: { username: true, displayName: true, bio: true, status: true },
      })
      if (!user) return { label: 'a deleted account', href: null, excerpt: null, hidden: false }
      return {
        label: nameOf(user),
        href: user.username ? `/@${user.username}` : null,
        excerpt: user.bio,
        hidden: false,
      }
    }
    case 'STORYBOARD': {
      const storyboard = await db.storyboard.findUnique({
        where: { id: targetId },
        select: { title: true, slug: true, logline: true, hiddenAt: true },
      })
      if (!storyboard) return { label: 'a deleted story', href: null, excerpt: null, hidden: false }
      return {
        label: storyboard.title,
        href: `/s/${storyboard.slug}`,
        excerpt: storyboard.logline,
        hidden: storyboard.hiddenAt !== null,
      }
    }
    case 'SUGGESTION': {
      const suggestion = await db.suggestion.findUnique({
        where: { id: targetId },
        select: { contentText: true, publicId: true, hiddenAt: true },
      })
      if (!suggestion) {
        return { label: 'a deleted suggestion', href: null, excerpt: null, hidden: false }
      }
      return {
        label: 'a suggestion',
        href: null,
        excerpt: suggestion.contentText.slice(0, 300),
        hidden: suggestion.hiddenAt !== null,
      }
    }
    case 'IDEA': {
      const idea = await db.idea.findUnique({
        where: { id: targetId },
        select: { body: true, hiddenAt: true },
      })
      if (!idea) return { label: 'a deleted idea', href: null, excerpt: null, hidden: false }
      return {
        label: 'an idea',
        href: null,
        excerpt: idea.body.slice(0, 300),
        hidden: idea.hiddenAt !== null,
      }
    }
    default:
      return { label: targetType, href: null, excerpt: null, hidden: false }
  }
}
