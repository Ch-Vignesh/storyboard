/**
 * Aligning two lists of paragraphs (architecture section 4, steps 2 to 4).
 *
 * Two passes, in this order and for a reason:
 *
 * 1. A longest common subsequence over normalised paragraphs finds the ones
 *    that did not change at all. LCS rather than a naive scan because it
 *    respects order: a paragraph that appears twice must not match the wrong
 *    occurrence, and an inserted paragraph must not shift everything after it.
 * 2. Everything the LCS left over is paired by similarity, greedily, still
 *    respecting order. This is what turns "removed one paragraph, added
 *    another" into "this paragraph was edited".
 */

import { PARAGRAPH_PAIR_THRESHOLD } from './constants'
import { dice, type Paragraph } from './paragraphs'

/** An index into the left list, the right list, or both. */
export type Alignment =
  | { kind: 'same'; left: number; right: number }
  | { kind: 'changed'; left: number; right: number }
  | { kind: 'removed'; left: number }
  | { kind: 'added'; right: number }

type Pair = { left: number; right: number }

/**
 * Longest common subsequence over normalised paragraph text.
 *
 * The classic dynamic-programming table. Prose sections are hundreds of
 * paragraphs at most, so a quadratic table costs nothing next to the risk of
 * getting an approximation subtly wrong.
 */
function longestCommonSubsequence(left: readonly Paragraph[], right: readonly Paragraph[]): Pair[] {
  const rows = left.length
  const columns = right.length
  const table: number[][] = Array.from({ length: rows + 1 }, () =>
    new Array<number>(columns + 1).fill(0),
  )

  for (let i = rows - 1; i >= 0; i--) {
    for (let j = columns - 1; j >= 0; j--) {
      table[i]![j] =
        left[i]!.normalised === right[j]!.normalised
          ? table[i + 1]![j + 1]! + 1
          : Math.max(table[i + 1]![j]!, table[i]![j + 1]!)
    }
  }

  const pairs: Pair[] = []
  let i = 0
  let j = 0
  while (i < rows && j < columns) {
    if (left[i]!.normalised === right[j]!.normalised) {
      pairs.push({ left: i, right: j })
      i += 1
      j += 1
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      i += 1
    } else {
      j += 1
    }
  }
  return pairs
}

/** True when taking `candidate` would straddle any pairing already taken. */
function crosses(taken: readonly Pair[], candidate: Pair): boolean {
  return taken.some(
    (pair) =>
      (pair.left < candidate.left && pair.right > candidate.right) ||
      (pair.left > candidate.left && pair.right < candidate.right),
  )
}

/**
 * Pair up the paragraphs the LCS did not match, by similarity.
 *
 * "Greedily, respecting order, never crossing two pairings" (architecture
 * section 4 step 3): consider candidate pairs best-first and take one only if
 * it crosses nothing already taken — the anchors included, which is why they
 * are passed in rather than checked separately. Crossing would render as two
 * paragraphs swapping places, which is not what the writer did; they moved one,
 * and the honest rendering of a move is a removal and an addition.
 */
function pairBySimilarity(
  left: readonly Paragraph[],
  right: readonly Paragraph[],
  anchors: readonly Pair[],
): Pair[] {
  const matchedLeft = new Set(anchors.map((pair) => pair.left))
  const matchedRight = new Set(anchors.map((pair) => pair.right))

  const candidates: Array<Pair & { score: number }> = []
  for (let l = 0; l < left.length; l++) {
    if (matchedLeft.has(l)) continue
    for (let r = 0; r < right.length; r++) {
      if (matchedRight.has(r)) continue
      const score = dice(left[l]!.bigrams, right[r]!.bigrams)
      if (score >= PARAGRAPH_PAIR_THRESHOLD) candidates.push({ left: l, right: r, score })
    }
  }

  // Best first; ties broken by position so the output is deterministic.
  candidates.sort((a, b) => b.score - a.score || a.left - b.left || a.right - b.right)

  const taken: Pair[] = [...anchors]
  const pairs: Pair[] = []
  const usedLeft = new Set(matchedLeft)
  const usedRight = new Set(matchedRight)

  for (const candidate of candidates) {
    if (usedLeft.has(candidate.left) || usedRight.has(candidate.right)) continue
    if (crosses(taken, candidate)) continue

    const pair = { left: candidate.left, right: candidate.right }
    pairs.push(pair)
    taken.push(pair)
    usedLeft.add(pair.left)
    usedRight.add(pair.right)
  }

  return pairs
}

/**
 * The full alignment, in reading order.
 *
 * No two pairings cross, so walking both lists together produces a sequence a
 * reader can follow straight down the page: matched rows in order, with
 * removals and additions falling where they belong between them.
 */
export function align(left: readonly Paragraph[], right: readonly Paragraph[]): Alignment[] {
  const anchors = longestCommonSubsequence(left, right)
  const changed = pairBySimilarity(left, right, anchors)

  const kindByLeft = new Map<number, 'same' | 'changed'>()
  const partnerOfLeft = new Map<number, number>()
  for (const pair of anchors) {
    kindByLeft.set(pair.left, 'same')
    partnerOfLeft.set(pair.left, pair.right)
  }
  for (const pair of changed) {
    kindByLeft.set(pair.left, 'changed')
    partnerOfLeft.set(pair.left, pair.right)
  }
  const pairedRight = new Set([...anchors, ...changed].map((pair) => pair.right))

  // Walk both sides at once. Because pairings never cross, whenever the left
  // cursor reaches a paired paragraph its partner is the next unconsumed
  // paired paragraph on the right, so everything before it on the right is an
  // addition and everything unpaired on the left is a removal.
  const rows: Alignment[] = []
  let l = 0
  let r = 0

  while (l < left.length || r < right.length) {
    if (l < left.length && !kindByLeft.has(l)) {
      rows.push({ kind: 'removed', left: l })
      l += 1
      continue
    }
    if (r < right.length && !pairedRight.has(r)) {
      rows.push({ kind: 'added', right: r })
      r += 1
      continue
    }
    if (l < left.length && r < right.length) {
      const partner = partnerOfLeft.get(l)!
      if (partner === r) {
        rows.push({ kind: kindByLeft.get(l)!, left: l, right: r })
        l += 1
        r += 1
        continue
      }
      // The right cursor has not reached this left paragraph's partner yet;
      // the rows between are additions, handled by the branch above.
      if (partner > r) {
        rows.push({ kind: 'added', right: r })
        r += 1
        continue
      }
      rows.push({ kind: 'removed', left: l })
      l += 1
      continue
    }
    if (l < left.length) {
      rows.push({ kind: 'removed', left: l })
      l += 1
      continue
    }
    rows.push({ kind: 'added', right: r })
    r += 1
  }

  return rows
}
