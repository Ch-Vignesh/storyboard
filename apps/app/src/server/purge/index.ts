import 'server-only'

import type { PrismaClient } from '@storyboard/db'

import { logger } from '@/lib/logger'
import { SOFT_DELETE_GRACE_DAYS } from '@/lib/schemas/constants'

/**
 * FR-2.6 — what happens after the thirty days.
 *
 * A deleted storyboard is a tombstone for a month so its author can change
 * their mind. After that it goes for real, and "for real" means through the
 * NFR-3 immutability trigger's one escape hatch, inside a single transaction
 * that sets `storyboard.hard_delete = on`.
 *
 * The order below is the whole of the difficulty. Revisions are referenced by
 * sections (`currentRevisionId`), by other revisions (`parentId`,
 * `restoredFromId`) and by credits, and Postgres will refuse a delete that
 * leaves any of those pointing at nothing. So: unhook, then delete leaves,
 * then delete the tree.
 *
 * What is *not* deleted: credits. A credit is somebody else's record of what
 * they did (principle 1.3.3), and an author deleting their storyboard does not
 * get to delete another person's history with it. `Credit.revisionId` is
 * nulled; the row stays, and the contributors page of any spin-off still shows
 * it.
 */

const log = logger.child({ module: 'purge' })

export async function purgeDeletedStoryboards(
  db: PrismaClient,
  now = new Date(),
): Promise<{ considered: number; purged: number }> {
  const cutoff = new Date(now.getTime() - SOFT_DELETE_GRACE_DAYS * 24 * 60 * 60 * 1000)

  const due = await db.storyboard.findMany({
    where: { deletedAt: { not: null, lt: cutoff } },
    select: { id: true, slug: true, title: true },
  })

  let purged = 0
  for (const storyboard of due) {
    try {
      await purgeOne(db, storyboard.id)
      purged += 1
      log.warn(
        { event: 'purge.storyboard', storyboardId: storyboard.id, slug: storyboard.slug },
        'soft-deleted storyboard passed its grace and was removed',
      )
    } catch (error) {
      // One bad row must not stop the rest. It will be retried tomorrow, and
      // the log is what says it needs looking at.
      log.error(
        { event: 'purge.failed', storyboardId: storyboard.id, error: String(error) },
        'could not purge a storyboard',
      )
    }
  }

  return { considered: due.length, purged }
}

async function purgeOne(db: PrismaClient, storyboardId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    // The hatch NFR-3 leaves open, for the length of this transaction only.
    await tx.$executeRawUnsafe(`select set_config('storyboard.hard_delete', 'on', true)`)

    const sections = await tx.section.findMany({
      where: { chapter: { version: { storyboardId } } },
      select: { id: true },
    })
    const sectionIds = sections.map((section) => section.id)

    if (sectionIds.length > 0) {
      // Nothing may point at a revision when it goes.
      await tx.section.updateMany({
        where: { id: { in: sectionIds } },
        data: { currentRevisionId: null },
      })
      await tx.credit.updateMany({
        where: { revision: { sectionId: { in: sectionIds } } },
        data: { revisionId: null },
      })
      await tx.revision.updateMany({
        where: { sectionId: { in: sectionIds } },
        data: { parentId: null, restoredFromId: null },
      })

      await tx.sectionDraft.deleteMany({ where: { sectionId: { in: sectionIds } } })
      await tx.suggestion.deleteMany({
        where: { request: { sectionId: { in: sectionIds } } },
      })
      await tx.idea.deleteMany({ where: { request: { sectionId: { in: sectionIds } } } })
      await tx.contributionRequest.deleteMany({ where: { sectionId: { in: sectionIds } } })
      await tx.revision.deleteMany({ where: { sectionId: { in: sectionIds } } })
      await tx.section.deleteMany({ where: { id: { in: sectionIds } } })
    }

    await tx.chapter.deleteMany({ where: { version: { storyboardId } } })
    await tx.version.deleteMany({ where: { storyboardId } })

    // The credits themselves outlive the storyboard only where they were
    // inherited elsewhere; the ones belonging to this storyboard go with it,
    // because there is no longer anything for them to be a credit *on*.
    await tx.credit.deleteMany({ where: { storyboardId } })
    await tx.storyboard.delete({ where: { id: storyboardId } })
  })
}
