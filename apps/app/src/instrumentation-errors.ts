import { prisma } from '@storyboard/db'
import type { Instrumentation } from 'next'
import { after } from 'next/server'

import { recordServerError } from '@/server/server-errors'

type ErrorContext = Parameters<Instrumentation.onRequestError>[2]

/**
 * Node only: `instrumentation.ts` imports this on the Node runtime alone, and
 * only once something has failed (phase 14, item 10.1).
 *
 * Where it happened is the route as written (`/s/[slug]`), never the address
 * that was asked for: an address carries a story's slug, and the record should
 * not. The request's headers and body are not read at all.
 *
 * Next does not wait for this while a page streams, so the write goes to
 * `after`, which keeps the function alive until it is done, as
 * `server/after-response.ts` does for email. Outside a request scope `after`
 * throws, and the write happens before this returns. It never fails: a fault
 * that cannot be written down is logged, and that is all.
 */
export async function keepRequestError(error: unknown, context: ErrorContext): Promise<void> {
  const write = () =>
    recordServerError(prisma, { source: context.routeType, location: context.routePath }, error)
  try {
    after(write)
  } catch {
    await write()
  }
}
