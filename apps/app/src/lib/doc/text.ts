/**
 * Everything derived from a document (FR-4.3, FR-13.6).
 *
 * `contentJson` is canonical. `contentText`, `wordCount` and `contentHash` are
 * computed from it on every write and never edited directly — that is the
 * whole of FR-4.3, and the reason these are pure functions with no database
 * and no TipTap import: the comparison engine (phase 2), search (deferred) and
 * the word counter in the editor all have to agree, so they all call these.
 */

import { createHash } from 'node:crypto'

import { SCREENPLAY_BLOCK_TYPES, type StoryboardDoc } from './schema'

type UnknownNode = {
  type?: unknown
  text?: unknown
  content?: unknown
  attrs?: unknown
}

const SCREENPLAY_TYPES = new Set<string>(SCREENPLAY_BLOCK_TYPES)

/** Blocks whose text stands alone as a paragraph when flattened. */
function isBlock(type: string): boolean {
  return (
    type === 'paragraph' ||
    type === 'heading' ||
    type === 'blockquote' ||
    SCREENPLAY_TYPES.has(type)
  )
}

/**
 * Flatten to plain text.
 *
 * Block boundaries become a blank line, because the comparison engine splits
 * on blank lines to find paragraphs (architecture section 4) — so the shape of
 * this output is load-bearing, not cosmetic. `hard_break` becomes a single
 * newline: it is a line break inside one paragraph, and turning it into a
 * paragraph boundary would make a poem diff as a dozen separate paragraphs.
 *
 * A `scene_break` contributes nothing but still separates the blocks around it.
 */
export function docToText(doc: StoryboardDoc): string {
  const blocks: string[] = []

  const walk = (node: UnknownNode): string => {
    if (typeof node.text === 'string') return node.text
    if (node.type === 'hard_break') return '\n'
    if (!Array.isArray(node.content)) return ''
    return (node.content as UnknownNode[]).map(walk).join('')
  }

  const visit = (node: UnknownNode): void => {
    const type = typeof node.type === 'string' ? node.type : ''

    if (type === 'blockquote') {
      // Recurse: a quote's paragraphs are paragraphs.
      if (Array.isArray(node.content)) (node.content as UnknownNode[]).forEach(visit)
      return
    }

    if (isBlock(type)) {
      const text = walk(node).trim()
      if (text.length > 0) blocks.push(text)
    }
  }

  if (Array.isArray(doc.content)) (doc.content as UnknownNode[]).forEach(visit)

  return blocks.join('\n\n')
}

/**
 * Words, counted the way a writer counts them: whitespace-separated runs that
 * contain at least one letter or digit. A standalone em dash or a row of
 * asterisks is punctuation, not a word, and counting it would make the 2000-word
 * warning (FR-2.5) and the suggestion bounds (FR-5.8) feel arbitrary.
 */
export function countWords(text: string): number {
  if (text.trim().length === 0) return 0
  let count = 0
  for (const token of text.split(/\s+/)) {
    if (/[\p{L}\p{N}]/u.test(token)) count += 1
  }
  return count
}

/** FR-13.6 — the timestamped, verifiable proof that this text existed. */
export function hashContent(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

export type DerivedContent = {
  contentText: string
  wordCount: number
  contentHash: string
}

/**
 * The three derived columns for a revision, from one document. Every write path
 * — authored, accepted, restored, imported — goes through this, so they cannot
 * disagree about what a section's word count is.
 */
export function derive(doc: StoryboardDoc): DerivedContent {
  const contentText = docToText(doc)
  return {
    contentText,
    wordCount: countWords(contentText),
    contentHash: hashContent(contentText),
  }
}

/** True when a document holds no words at all — a new, untouched section. */
export function isEmptyDoc(doc: StoryboardDoc): boolean {
  return docToText(doc).trim().length === 0
}
