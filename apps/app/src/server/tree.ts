import type { Prisma, PrismaClient } from '@storyboard/db'

/**
 * Copying a chapter and section tree.
 *
 * Lives here rather than in a router because it is a data operation two routers
 * need — `version.create` and `spinOff.create` — and because a router drags
 * the whole tRPC and Auth.js stack behind it, which made this untestable
 * without a running Next.js.
 */

/**
 * Copies a version's chapters and sections into another version.
 *
 * Revisions are shared rather than copied — they are immutable, so two
 * sections pointing at the same revision is not a hazard, it is the whole
 * design (architecture section 2.2). `lineageId` comes across unchanged, which
 * is what makes the copy recognisable as the same section later.
 */
export async function copyTree(
  tx: Prisma.TransactionClient | PrismaClient,
  fromVersionId: string,
  toVersionId: string,
  /**
   * Decision 0019 — whether the copy gets revisions of its own.
   *
   * Sharing is right inside one storyboard and wrong across two. A spin-off
   * whose sections point at the original's revisions is coupled to the
   * original's lifecycle: FR-2.6's purge would empty it thirty days after
   * somebody else pressed delete. Across a storyboard boundary, copy.
   */
  { copyRevisions = false }: { copyRevisions?: boolean } = {},
): Promise<Map<string, string>> {
  /** Old revision id to new, for callers that hold references (credits). */
  const remapped = new Map<string, string>()

  const chapters = await tx.chapter.findMany({
    where: { versionId: fromVersionId, deletedAt: null },
    orderBy: { order: 'asc' },
    select: {
      lineageId: true,
      order: true,
      title: true,
      sections: {
        where: { deletedAt: null, mergedIntoId: null },
        orderBy: { order: 'asc' },
        select: {
          lineageId: true,
          order: true,
          title: true,
          wordCount: true,
          currentRevisionId: true,
        },
      },
    },
  })

  for (const chapter of chapters) {
    const copy = await tx.chapter.create({
      data: {
        versionId: toVersionId,
        lineageId: chapter.lineageId,
        order: chapter.order,
        title: chapter.title,
      },
      select: { id: true },
    })

    for (const section of chapter.sections) {
      const created = await tx.section.create({
        data: {
          chapterId: copy.id,
          lineageId: section.lineageId,
          order: section.order,
          title: section.title,
          wordCount: section.wordCount,
          // Inside one storyboard: the same revision, not a copy of it
          // (architecture section 2.2, decision 0014). Both sections walk back
          // through one `parentId` chain, which is what makes their shared
          // history real. Across storyboards the head is replaced below.
          currentRevisionId: copyRevisions ? null : section.currentRevisionId,
        },
        select: { id: true },
      })

      if (copyRevisions && section.currentRevisionId) {
        const head = await tx.revision.findUnique({
          where: { id: section.currentRevisionId },
          select: {
            contentJson: true,
            contentText: true,
            wordCount: true,
            contentHash: true,
            source: true,
            authorId: true,
            acceptedById: true,
            createdAt: true,
          },
        })

        if (head) {
          // Decision 0019 — everything true of the revision travels: the words,
          // who wrote them, who accepted them, when, and the hash that proves
          // it. What does not travel is the chain (`parentId`,
          // `restoredFromId`), which belongs to the original's history, and
          // `suggestionId`, which is unique and belongs to a suggestion sent to
          // somebody else.
          const made = await tx.revision.create({
            data: {
              ...head,
              sectionId: created.id,
              // Prisma reads `Json` as nullable and writes it as not; a stored
              // revision always has a document, and an empty one is storable.
              contentJson: head.contentJson ?? {},
            },
            select: { id: true },
          })
          await tx.section.update({
            where: { id: created.id },
            data: { currentRevisionId: made.id },
          })
          remapped.set(section.currentRevisionId, made.id)
        }
      }
    }
  }

  return remapped
}
