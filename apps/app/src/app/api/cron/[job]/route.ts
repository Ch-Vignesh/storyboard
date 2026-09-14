import { prisma } from '@storyboard/db'
import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'

import { logger } from '@/lib/logger'
import { CRON_JOBS, type CronJob } from '@/server/mail/digests'

/**
 * The scheduler's entry point (decision 0012).
 *
 * Vercel Cron calls these on a schedule in production; `pnpm cron <job>` calls
 * them locally, and the tests call the underlying functions directly. The work
 * itself lives in `server/mail/digests.ts` and knows nothing about HTTP.
 */

export const dynamic = 'force-dynamic'

const log = logger.child({ route: 'cron' })

/** Constant-time comparison, so the secret cannot be guessed a byte at a time. */
function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function POST(request: Request, context: { params: Promise<{ job: string }> }) {
  const expected = process.env.CRON_SECRET
  // No secret configured means no scheduled work can run. Failing closed is
  // right: this endpoint is a public URL that sends email.
  if (!expected) {
    log.error({ event: 'cron.misconfigured' }, 'CRON_SECRET is not set')
    return new NextResponse('Not configured', { status: 503 })
  }

  const header = request.headers.get('authorization')
  const provided = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!secretMatches(provided, expected)) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const { job } = await context.params
  const run = CRON_JOBS[job as CronJob] as ((db: typeof prisma) => Promise<unknown>) | undefined
  if (!run) return new NextResponse('No such job', { status: 404 })

  try {
    const result = await run(prisma)
    log.info({ event: 'cron.ran', job, result }, 'cron job finished')
    return NextResponse.json({ job, ...(result as object) })
  } catch (error) {
    log.error({ event: 'cron.failed', job, error: String(error) }, 'cron job failed')
    return new NextResponse('Failed', { status: 500 })
  }
}

/** GET is allowed too: some schedulers only issue GETs. Same authentication. */
export const GET = POST
