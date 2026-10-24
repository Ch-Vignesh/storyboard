import { prisma } from '@storyboard/db'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'

import { createTRPCContext } from '@/server/trpc/init'
import { appRouter } from '@/server/trpc/routers/_app'
import { logger } from '@/lib/logger'
import { afterResponse } from '@/server/after-response'
import { recordServerError } from '@/server/server-errors'

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ headers: req.headers }),
    onError({ path, error }) {
      if (error.code === 'INTERNAL_SERVER_ERROR') {
        logger.error({ event: 'trpc.error', path, err: error }, 'unhandled tRPC error')
        // Phase 14, item 10.1 (D-10) — kept, so somebody hears about it, once
        // the response has gone. The cause is what a library threw; the
        // TRPCError around it adds nothing but its own name. Internal errors
        // only: a refusal a procedure wrote for a person is not a fault.
        void afterResponse(() =>
          recordServerError(
            prisma,
            { source: 'trpc', location: path ?? 'unknown' },
            error.cause ?? error,
          ),
        )
      }
    },
  })

export { handler as GET, handler as POST }
