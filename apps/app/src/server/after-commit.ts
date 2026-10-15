import 'server-only'

import { logger } from '@/lib/logger'

const log = logger.child({ module: 'after-commit' })

/**
 * A side effect of work that is already saved: a notification, mostly.
 *
 * Logged if it fails, never thrown. By the time this runs the person's action
 * has gone through, and an error now would tell them it had not: they would
 * try again and be told "already decided", or, for a restore, write the
 * revision twice (phase 12 audit). Missing a notification is the smaller harm.
 */
export async function afterCommit(event: string, work: () => Promise<unknown>): Promise<void> {
  try {
    await work()
  } catch (error) {
    log.error({ event, error: String(error) }, 'a side effect of saved work failed')
  }
}
