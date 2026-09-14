import { prisma } from '@storyboard/db'
import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import { z, ZodError } from 'zod'

import { auth } from '@/auth'

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

// `authorProcedure` (owner or co-author of a given storyboard, architecture
// section 6) arrives with storyboards in phase 1, backed by lib/authz.
