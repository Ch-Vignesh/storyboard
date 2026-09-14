/**
 * The comparison engine (FR-7, architecture section 4).
 *
 * Pure functions, no database, no rendering. `compare(base, target)` takes two
 * pieces of flattened prose — `Revision.contentText` — and returns what
 * changed, at the paragraph level and then at the word level inside paragraphs
 * that were edited.
 *
 * Two rules from the requirements shape the whole thing:
 *
 * - **Never diff below the word** (FR-7.3). Character-level marks are
 *   unreadable on prose.
 * - **A rewrite is not an edit** (FR-7.2.3). When barely anything aligns, marks
 *   are dropped entirely and the view opens as a plain read-through, because
 *   marking every word communicates nothing.
 */

import { diffWordsWithSpace } from 'diff'

import { align } from './align'
import { REWRITE_ALIGNMENT_THRESHOLD } from './constants'
import { toParagraphs } from './paragraphs'

export {
  PARAGRAPH_PAIR_THRESHOLD,
  REWRITE_ALIGNMENT_THRESHOLD,
  COMPARISON_BUDGET_MS,
} from './constants'
export { dice, normalise, toParagraphs } from './paragraphs'

/** A run of words, and whether it survived. */
export type WordMark = {
  text: string
  /** `same` on both sides, `removed` only on the left, `added` only on the right. */
  kind: 'same' | 'removed' | 'added'
}

export type ComparisonRow = {
  kind: 'same' | 'changed' | 'added' | 'removed'
  left?: { text: string; marks?: WordMark[] }
  right?: { text: string; marks?: WordMark[] }
}

export type ComparisonStats = {
  kept: number
  changed: number
  added: number
  removed: number
}

export type ComparisonResult = {
  /** `rewrite` means the marks were dropped on purpose; show a read-through. */
  mode: 'marks' | 'rewrite'
  rows: ComparisonRow[]
  stats: ComparisonStats
}

/**
 * Word-level marks for one edited pair.
 *
 * `diffWordsWithSpace` keeps whitespace attached to its word, so reassembling
 * the marks in order reproduces the original text exactly — which matters,
 * because the marks *are* what gets rendered.
 */
function markWords(before: string, after: string): { left: WordMark[]; right: WordMark[] } {
  const parts = diffWordsWithSpace(before, after)
  const left: WordMark[] = []
  const right: WordMark[] = []

  for (const part of parts) {
    if (part.added) {
      right.push({ text: part.value, kind: 'added' })
    } else if (part.removed) {
      left.push({ text: part.value, kind: 'removed' })
    } else {
      left.push({ text: part.value, kind: 'same' })
      right.push({ text: part.value, kind: 'same' })
    }
  }

  return { left, right }
}

function statsFor(rows: readonly ComparisonRow[]): ComparisonStats {
  const stats = { kept: 0, changed: 0, added: 0, removed: 0 }
  for (const row of rows) {
    if (row.kind === 'same') stats.kept += 1
    else if (row.kind === 'changed') stats.changed += 1
    else if (row.kind === 'added') stats.added += 1
    else stats.removed += 1
  }
  return stats
}

/**
 * Compare two pieces of prose.
 *
 * The same function serves all three cases FR-7.5 lists — a suggestion against
 * the current text, one revision against another, an alternate version against
 * the main draft — because all three are two pieces of text. There are no
 * variant code paths.
 */
export function compare(base: string, target: string): ComparisonResult {
  const left = toParagraphs(base)
  const right = toParagraphs(target)
  const alignments = align(left, right)

  /**
   * A paragraph the LCS matched is "the same paragraph", but that match is made
   * on the *normalised* text — so a copy-edit that only moves a comma or
   * straightens a quote aligns as `same` while the two raw strings differ.
   *
   * Reporting that as unchanged would hide exactly the edit a copy-editing pass
   * exists to show, so a matched pair whose raw text differs is promoted to
   * `changed` and gets word marks like any other edit.
   */
  const refined = alignments.map((alignment) =>
    alignment.kind === 'same' && left[alignment.left]!.text !== right[alignment.right]!.text
      ? ({ ...alignment, kind: 'changed' } as const)
      : alignment,
  )

  // FR-7.2.3 — below the threshold this is a rewrite, not an edit. Measured on
  // alignment, which promotion does not change: a promoted row is still aligned.
  const alignedCount = refined.filter(
    (alignment) => alignment.kind === 'same' || alignment.kind === 'changed',
  ).length
  const longest = Math.max(left.length, right.length)
  const isRewrite = longest > 0 && alignedCount / longest < REWRITE_ALIGNMENT_THRESHOLD

  const rows: ComparisonRow[] = refined.map((alignment) => {
    switch (alignment.kind) {
      case 'same': {
        const text = left[alignment.left]!.text
        return { kind: 'same', left: { text }, right: { text: right[alignment.right]!.text } }
      }
      case 'changed': {
        const before = left[alignment.left]!.text
        const after = right[alignment.right]!.text
        if (isRewrite) {
          return { kind: 'changed', left: { text: before }, right: { text: after } }
        }
        const marks = markWords(before, after)
        return {
          kind: 'changed',
          left: { text: before, marks: marks.left },
          right: { text: after, marks: marks.right },
        }
      }
      case 'removed':
        return { kind: 'removed', left: { text: left[alignment.left]!.text } }
      case 'added':
        return { kind: 'added', right: { text: right[alignment.right]!.text } }
    }
  })

  return { mode: isRewrite ? 'rewrite' : 'marks', rows, stats: statsFor(rows) }
}
