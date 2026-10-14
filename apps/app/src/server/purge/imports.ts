import 'server-only'

import type { PrismaClient } from '@storyboard/db'

import { logger } from '@/lib/logger'
import { IMPORT_JOB_RETENTION_HOURS } from '@/lib/schemas/constants'
import { deleteObject } from '@/server/storage'

/**
 * Imports nobody is working on any more (FR-3.1).
 *
 * A committed import deletes its file as its last step. Every other way an
 * import ends — the writer closes the tab, the parse fails, they choose a
 * different file — left the upload in the bucket for good, which was harmless
 * while uploads went to a serverless instance's temporary disk and became a
 * stranger's whole manuscript kept indefinitely the day R2 was switched on.
 *
 * So a job is working state. A day after its last change, its file goes and
 * then its row, whatever state it reached. A committed job's file is already
 * gone, and deleting a missing object succeeds, so the rule needs no special
 * case. The row goes too: nothing reads a job once its flow is over, and its
 * proposal holds the chapter titles and the opening words of every section —
 * which should not outlive a storyboard the writer has since deleted.
 *
 * File first, then row. If the store cannot be reached, the row stays, and so
 * does the only pointer to the file; tomorrow's run tries again.
 */

const log = logger.child({ module: 'purge.imports' })

export async function purgeAbandonedImports(
  db: PrismaClient,
  now = new Date(),
): Promise<{ considered: number; purged: number }> {
  const cutoff = new Date(now.getTime() - IMPORT_JOB_RETENTION_HOURS * 60 * 60 * 1000)

  const due = await db.importJob.findMany({
    where: { updatedAt: { lt: cutoff } },
    select: { id: true, fileKey: true },
  })

  let purged = 0
  for (const job of due) {
    if (!(await deleteObject(job.fileKey))) continue
    // deleteMany, not delete: an account purge may have taken the row already.
    const { count } = await db.importJob.deleteMany({ where: { id: job.id } })
    purged += count
  }

  if (due.length) {
    log.info(
      { event: 'purge.imports', considered: due.length, purged },
      'old imports and their uploads removed',
    )
  }
  return { considered: due.length, purged }
}
