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
