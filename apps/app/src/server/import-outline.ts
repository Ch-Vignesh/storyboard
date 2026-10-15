import type { ConfirmedOutline } from '@/lib/schemas/import'

/**
 * FR-3.2 — what is wrong with a confirmed outline, or `null` if nothing is.
 *
 * The review screen only joins, splits and moves boundaries, so what it sends
 * is a run of block ranges in order, none overlapping, all inside the file.
 * Gaps are allowed: a proposal can leave blocks out. Nothing else is, because
 * the schema alone let every one of 250,000 sections claim the whole
 * manuscript, and one commit wrote it that many times (phase 12 audit).
 */
export function outlineProblem(outline: ConfirmedOutline, blockCount: number): string | null {
  let previousEnd = -1
  for (const chapter of outline) {
    for (const section of chapter.sections) {
      if (section.from > section.to) return 'A section ends before it begins.'
      if (section.to >= blockCount) return 'A section reaches past the end of the file.'
      if (section.from <= previousEnd) return 'Two sections claim the same part of the file.'
      previousEnd = section.to
    }
  }
  return null
}
