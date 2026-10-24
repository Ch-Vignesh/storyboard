import type { Instrumentation } from 'next'

/**
 * Next calls this once, when a server instance starts (phase 10).
 *
 * The line it logs is how a cold start shows up in production: one per new
 * instance, with how long the process had been running before the
 * application's own code did. Counting them against requests says how often
 * somebody waits for one; the figure says how much of the wait is the platform.
 *
 * The work is in `instrumentation-node.ts` because this file is also compiled
 * for the Edge runtime, which has no `process.uptime`.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('./instrumentation-node')
}

/**
 * Phase 14, item 10.1 (NFR-7, D-10) — every fault Next catches on the server:
 * a page or layout that throws while it renders, a route handler, a server
 * action, the proxy. Next has already set aside what is not a fault
 * (`notFound()`, `redirect()`), so whatever arrives here is internal, and it
 * is kept in the database for the admin panel's Errors screen. Node only, and
 * loaded only once something has failed: the Edge runtime has no database
 * client, and a healthy instance never needs this.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, _request, context) => {
  // The same shape as `register`'s: the condition is a constant in each
  // runtime's build, so the Edge bundle drops the import altogether.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { keepRequestError } = await import('./instrumentation-errors')
    await keepRequestError(error, context)
  }
}
