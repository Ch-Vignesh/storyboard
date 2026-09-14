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
  return { db: prisma, session, headers: opts.headers }
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
 * `status` is deliberately absent: sign-in already refuses a non-ACTIVE
 * account, so a session implies an active one at the moment it was issued. A
 * JWT outliving a suspension (up to 30 days) is a real gap, and phase 6 — which
 * builds suspension and re-audits this module — is where it gets closed.
 */
export function actorFrom(session: Session | null): Actor {
  return session?.user ? { id: session.user.id } : null
}

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
    const storyboard = await loadStoryboardAsAuthor(ctx.db, actorFrom(ctx.session), {
      id: input.storyboardId,
    })
    return next({ ctx: { ...ctx, storyboard } })
  })
