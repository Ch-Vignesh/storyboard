import { fetchRequestHandler } from '@trpc/server/adapters/fetch'

import { createTRPCContext } from '@/server/trpc/init'
import { appRouter } from '@/server/trpc/routers/_app'
import { logger } from '@/lib/logger'

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ headers: req.headers }),
    onError({ path, error }) {
      if (error.code === 'INTERNAL_SERVER_ERROR') {
        logger.error({ event: 'trpc.error', path, err: error }, 'unhandled tRPC error')
      }
    },
  })

export { handler as GET, handler as POST }
