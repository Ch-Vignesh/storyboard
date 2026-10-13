import 'server-only'

import { after } from 'next/server'

/**
 * Run work once the response has gone (phase 10).
 *
 * Inside a request, Next's `after` keeps the function alive until the work is
 * done — Vercel waits for it — while the person already has their answer. It
 * is for work that is slow and that the response does not depend on: an email
 * that takes Gmail several seconds to accept should not hold a sign-up form.
 *
 * Outside a request (tests, scripts, the cron runner) there is no response to
 * wait for, so the work runs before this returns, which keeps those callers
 * deterministic. The task must handle its own failures: once the response has
 * gone, there is nobody left to throw to.
 */
export async function afterResponse(task: () => Promise<void>): Promise<void> {
  try {
    after(task)
  } catch {
    // `after` throws synchronously when there is no request scope.
    await task()
  }
}
