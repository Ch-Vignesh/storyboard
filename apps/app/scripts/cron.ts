/**
 * `pnpm cron <job>` — run a scheduled email job locally (decision 0012).
 *
 * Production calls `/api/cron/<job>` on a schedule; this calls the same
 * functions directly, so digests can be exercised on demand without waiting an
 * hour or standing up a scheduler. The tests call them the same way.
 *
 * Run through `tsx`, like the seed: the workspace packages ship TypeScript
 * source and expect their consumer to compile it. With the `react-server`
 * condition, which is how Next itself resolves the server: the jobs reach
 * modules marked `server-only`, and that package throws under any other
 * condition. Without it this script had stopped working by phase 9, and
 * nobody had run it since (phase 12 audit).
 */
import { loadRootEnv } from '@storyboard/config/env'

loadRootEnv()

// Every job the cron route runs (`CRON_JOBS`); prune and purge were missing,
// so neither could be run from here.
const JOBS = ['immediate', 'hourly', 'weekly', 'nudge', 'prune', 'purge'] as const
type Job = (typeof JOBS)[number]

const job = process.argv[2] as Job | undefined

if (!job || !JOBS.includes(job)) {
  console.error(`Usage: pnpm cron <${JOBS.join('|')}>`)
  process.exit(1)
}

// The root `.env` names the live database and the real mail account, so a
// job run from a laptop would email real people (phase 12 audit; the weekly
// digest at least records whom it reached since item 10.6). Seed-demo, the
// tests and the browser flows already refuse a hosted database; so does this,
// unless the person running it says they mean it.
const { isLocalDatabase } = await import('@storyboard/config/env')
if (!isLocalDatabase(process.env.DATABASE_URL ?? '') && !process.argv.includes('--production')) {
  console.error(
    'DATABASE_URL is not a local database, so this would email real people.\n' +
      `Run against a local one, or add --production if that is what you mean: pnpm cron ${job} --production`,
  )
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
