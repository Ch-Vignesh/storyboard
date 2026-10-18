/**
 * FR-9.2 with decision 0041 (phase 14, item 6.17) — what share of a story's
 * main draft is the author's own words. Owning the story is the credit
 * (D-13); this is the other number a visitor wants: how much of it the author
 * wrote themselves.
 *
 * Counted over the live sections of the main draft, by who wrote the revision
 * each one stands on. An owner's or a co-author's revision is the author's
 * own (decision 0041: a co-author writes as the author). Anyone else's, which
 * is to say an accepted suggestion's writer's, is a contributor's, and so is
 * one whose writer has since erased their name: the words are still not the
 * author's. Null when there are no words to share out.
 */
export function ownShareOf(
  sections: ReadonlyArray<{ wordCount: number; authorId: string | null | undefined }>,
  authorIds: ReadonlySet<string>,
): number | null {
  let total = 0
  let own = 0
  for (const section of sections) {
    total += section.wordCount
    if (section.authorId && authorIds.has(section.authorId)) own += section.wordCount
  }
  if (total === 0) return null
  return Math.round((own / total) * 100)
}

/** The sentence every surface prints for it; nothing when there is nothing to say. */
export function ownShareSentence(share: number | null | undefined): string | null {
  return share === null || share === undefined
    ? null
    : `${String(share)}% of the main draft is the author’s own words`
}
