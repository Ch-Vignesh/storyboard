import { prisma, type Role, type UserStatus } from '@storyboard/db'
import { initTRPC, TRPCError } from '@trpc/server'
import type { Session } from 'next-auth'
import superjson from 'superjson'
import { z, ZodError } from 'zod'

import { auth } from '@/auth'
import type { Actor } from '@/lib/authz'
import { canAdmin, type AdminCapability } from '@/lib/authz/admin'
import { loadStoryboardAsAuthor } from '@/lib/authz/guard'
import { logger } from '@/lib/logger'
import { SLOW_PROCEDURE_MS } from '@/lib/schemas/constants'
import { grantsOf } from '@/server/admin-actor'
import { noteSeen } from '@/server/last-seen'

/**
 * The signed-in account's live state, read once per request (FR-13.5): its
 * standing, its role and, for a sub-admin, its grants (decision 0043).
 */
export type Account = {
  status: UserStatus
  isAdmin: boolean
  role: Role
  deletionRequestedAt: Date | null
  username: string | null
  grants: string[]
} | null

export async function createTRPCContext(opts: { headers: Headers }) {
  const session = await auth()

  // FR-13.5 — a suspension has to bite now, not when the token happens to
  // expire. Sessions are JWTs and can outlive a suspension by up to 30 days, so
  // the account's live state is read once per authenticated request and carried
  // on the actor. One indexed lookup by primary key; the alternative is a
  // suspended person writing for a month.
  const row = session?.user
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          status: true,
          isAdmin: true,
          role: true,
          deletionRequestedAt: true,
          username: true,
          lastSeenAt: true,
        },
      })
    : null
  let account: Account = null
  if (row && session?.user) {
    const { lastSeenAt, ...rest } = row
    // A sub-admin's grants ride along (decision 0043); for anyone else that is
    // no second query. And the hour's visit is noted (item 2b.4), after the
    // response has gone.
    account = { ...rest, grants: await grantsOf(prisma, { id: session.user.id, role: row.role }) }
    await noteSeen(prisma, { id: session.user.id, lastSeenAt })
  }

  return { db: prisma, session, account, headers: opts.headers }
}

export type Context = Awaited<ReturnType<typeof createTRPCContext>>

/**
 * What a person is told when the fault is ours. Every message a procedure
 * writes for people is a `TRPCError` with a code of its own; an
 * `INTERNAL_SERVER_ERROR` is whatever a library threw, and its text is for the
 * logs. On 2026-10-15 the sign-up form showed a stranger Prisma's "The column
 * `User.passwordChangedAt` does not exist in the current database".
 */
export const SERVER_FAULT_MESSAGE =
  'Something went wrong on our side, not yours. Try again in a minute.'

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    // The real error is not lost: the route's `onError` logs it before this runs.
    // Input that failed validation says the first thing wrong with it, in the
    // words the schema gave it; tRPC's own message is the issue list as JSON,
    // which the forms were showing to people (phase 12 audit).
    const invalid = error.cause instanceof ZodError ? error.cause.issues[0]?.message : undefined
    const message =
      error.code === 'INTERNAL_SERVER_ERROR' ? SERVER_FAULT_MESSAGE : (invalid ?? shape.message)
    return {
      ...shape,
      message,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? z.flattenError(error.cause) : null,
      },
    }
  },
})

/**
 * Every procedure is timed, and a slow one is logged with its path (phase 10).
 * A page that is slow in production then names the call that made it slow,
 * instead of leaving it to be guessed at from the outside.
 */
const timedProcedure = t.procedure.use(async ({ path, type, next }) => {
  const started = performance.now()
  const result = await next()
  const ms = Math.round(performance.now() - started)
  if (ms >= SLOW_PROCEDURE_MS) {
    logger.warn({ event: 'trpc.slow', path, type, ms, ok: result.ok }, 'slow procedure')
  }
  if (!result.ok && refusedNul(result.error.cause)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: NUL_REFUSED, cause: result.error })
  }
  return result
})

/**
 * Postgres stores no NUL character, in text (22021) or in JSON (22P05). One
 * pasted from somewhere, or sent on purpose, reached the person as a fault of
 * ours from every field that takes free text (2026-10-26 final pass, the
 * detective review). Said once here, for all of them.
 */
const NUL_REFUSED =
  'That text has an invisible character in it that cannot be saved. Paste it as plain text and try again.'

function refusedNul(error: unknown): boolean {
  const code = (
    error as { meta?: { driverAdapterError?: { cause?: { originalCode?: unknown } } } } | null
  )?.meta?.driverAdapterError?.cause?.originalCode
  return code === '22021' || code === '22P05'
}

/**
 * The session as `lib/authz` wants it. A guest is `null`, which is the only
 * shape `can()` accepts for "signed out" — there is no anonymous actor object.
 *
 * The account's live status travels with it (FR-13.5). Pass the context's
 * `account` wherever you have one: without it this reads as an active account,
 * which is right for the callers that have already established that and wrong
 * for anyone who has not.
 */
export function actorFrom(
  session: Session | null,
  account?: {
    status: 'ACTIVE' | 'SUSPENDED' | 'DELETED'
    deletionRequestedAt?: Date | null
    role?: Role
    grants?: readonly string[]
  } | null,
): Actor {
  if (!session?.user) return null
  if (!account) return { id: session.user.id }
  const deletionRequestedAt = account.deletionRequestedAt ?? null
  return {
    id: session.user.id,
    status: account.status,
    deletionRequestedAt,
    // Decision 0045 (item 2.7) — may see what moderation has hidden. Only a
    // caller that knows the role says so; the export routes pass none.
    moderator:
      account.role !== undefined &&
      canAdmin(
        { role: account.role, status: account.status, deletionRequestedAt, grants: account.grants },
        'reports.decide',
      ),
  }
}

/**
 * Refuses a suspended or deleted account before a procedure runs (FR-13.5),
 * without asking for a username. Only for the two things somebody must be
 * able to do before they have one: choose it, and leave.
 */
export const accountProcedure = timedProcedure.use(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sign in first.' })
  }
  if (ctx.account && ctx.account.status !== 'ACTIVE') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message:
        'This account is suspended while some reports about it are reviewed. Your work stays where it is.',
    })
  }
  // Inside the deletion grace period (decision 0024). Not an error to apologise
  // for: they asked for this, and the message says how to undo it.
  if (ctx.account?.deletionRequestedAt) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message:
        'This account is being deleted, so it cannot write anything. You can stop the deletion in settings.',
    })
  }
  return next({ ctx: { ...ctx, session: { ...ctx.session, user: ctx.session.user } } })
})

/**
 * `accountProcedure`, and a username: everything that writes. Whatever
 * somebody writes is credited to that name (FR-1.3), and onboarding used to
 * be enforced only by `proxy.ts`, which does not cover `/api/` — so an
 * account with no username could write, and showed as "a former contributor"
 * (phase 12 audit).
 */
export const activeProcedure = accountProcedure.use(({ ctx, next }) => {
  if (ctx.account && !ctx.account.username) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Choose a username first.' })
  }
  return next()
})

/**
 * Requires a signed-in administrator with the named capability (FR-15.5,
 * decision 0043) whose own account is in good standing. Until the phase 12
 * audit only `isAdmin` was checked, so a suspended admin kept every power for
 * as long as their session lasted; until phase 14 (item 2b.2) there was one
 * power rather than several, and no way to hold some of them.
 */
export function adminProcedure(capability: AdminCapability) {
  return timedProcedure.use(({ ctx, next }) => {
    // Not FORBIDDEN: an admin screen is not a thing to be told about.
    if (!ctx.session?.user || !canAdmin(ctx.account, capability)) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Not found.' })
    }
    return next({ ctx: { ...ctx, session: { ...ctx.session, user: ctx.session.user } } })
  })
}

export const createTRPCRouter = t.router
export const createCallerFactory = t.createCallerFactory
export const mergeRouters = t.mergeRouters

/** Anyone, signed in or not. Data-layer checks still apply to what it returns. */
export const publicProcedure = timedProcedure

/** Requires a session. `ctx.session.user` is non-null downstream. */
export const protectedProcedure = timedProcedure.use(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sign in to continue.' })
  }
  return next({ ctx: { ...ctx, session: { ...ctx.session, user: ctx.session.user } } })
})

/**
 * Owner or co-author of the storyboard named in the input (architecture
 * section 6). The check runs at the data layer via `loadStoryboardAsAuthor`,
 * not here — this procedure only makes the common case short and hands the
 * resolved storyboard and permissions to the resolver.
 *
 * Procedures that address a storyboard by something other than its id (a
 * section, a chapter, a slug) call the matching loader in `lib/authz/guard`
 * directly; both routes end in the same `assertCan`.
 */
export const authorProcedure = protectedProcedure
  .input(z.object({ storyboardId: z.string().min(1) }))
  .use(async ({ ctx, input, next }) => {
    const storyboard = await loadStoryboardAsAuthor(ctx.db, actorFrom(ctx.session, ctx.account), {
      id: input.storyboardId,
    })
    return next({ ctx: { ...ctx, storyboard } })
  })
