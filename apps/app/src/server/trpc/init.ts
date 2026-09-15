import { prisma } from '@storyboard/db'
import { initTRPC, TRPCError } from '@trpc/server'
import type { Session } from 'next-auth'
import superjson from 'superjson'
import { z, ZodError } from 'zod'

import { auth } from '@/auth'
import type { Actor } from '@/lib/authz'
import { loadStoryboardAsAuthor } from '@/lib/authz/guard'

export async function createTRPCContext(opts: { headers: Headers }) {
  const session = await auth()

  // FR-13.5 — a suspension has to bite now, not when the token happens to
  // expire. Sessions are JWTs and can outlive a suspension by up to 30 days, so
  // the account's live state is read once per authenticated request and carried
  // on the actor. One indexed lookup by primary key; the alternative is a
  // suspended person writing for a month.
  const account = session?.user
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { status: true, isAdmin: true, deletionRequestedAt: true },
      })
    : null

  return { db: prisma, session, account, headers: opts.headers }
}

export type Context = Awaited<ReturnType<typeof createTRPCContext>>

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? z.flattenError(error.cause) : null,
      },
    }
  },
})

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
  } | null,
): Actor {
  if (!session?.user) return null
  return account
    ? {
        id: session.user.id,
        status: account.status,
        deletionRequestedAt: account.deletionRequestedAt ?? null,
      }
    : { id: session.user.id }
}

/**
 * Refuses a suspended or deleted account before a procedure runs (FR-13.5).
 *
 * `can()` already refuses every capability for such an actor, but not every
 * mutation goes through a storyboard — reporting, profile edits and account
 * settings do not — so the gate is here as well as there.
 */
export const activeProcedure = t.procedure.use(({ ctx, next }) => {
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

/** Requires a signed-in administrator (FR-15.5). */
export const adminProcedure = t.procedure.use(({ ctx, next }) => {
  // Not FORBIDDEN: an admin screen is not a thing to be told about.
  if (!ctx.session?.user || !ctx.account?.isAdmin) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Not found.' })
  }
  return next({ ctx: { ...ctx, session: { ...ctx.session, user: ctx.session.user } } })
})

export const createTRPCRouter = t.router
export const createCallerFactory = t.createCallerFactory
export const mergeRouters = t.mergeRouters

/** Anyone, signed in or not. Data-layer checks still apply to what it returns. */
export const publicProcedure = t.procedure

/** Requires a session. `ctx.session.user` is non-null downstream. */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
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
