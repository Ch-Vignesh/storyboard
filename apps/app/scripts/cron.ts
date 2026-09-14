/**
 * `pnpm cron <job>` — run a scheduled email job locally (decision 0012).
 *
 * Production calls `/api/cron/<job>` on a schedule; this calls the same
 * functions directly, so digests can be exercised on demand without waiting an
 * hour or standing up a scheduler. The tests call them the same way.
 *
 * Run through `tsx`, like the seed: the workspace packages ship TypeScript
 * source and expect their consumer to compile it.
 */
import { loadRootEnv } from '@storyboard/config/env'

loadRootEnv()

const JOBS = ['immediate', 'hourly', 'weekly', 'nudge'] as const
type Job = (typeof JOBS)[number]

const job = process.argv[2] as Job | undefined

if (!job || !JOBS.includes(job)) {
  console.error(`Usage: pnpm cron <${JOBS.join('|')}>`)
  process.exit(1)
}

const { prisma } = await import('@storyboard/db')
const { CRON_JOBS } = await import('../src/server/mail/digests')

try {
  const result = await CRON_JOBS[job](prisma)
  console.warn(`${job}:`, JSON.stringify(result))
} finally {
  await prisma.$disconnect()
}
