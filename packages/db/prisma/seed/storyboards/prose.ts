import { createHash } from 'node:crypto'

/**
 * Seeded prose to the shapes the database keeps (FR-4.1, FR-4.3), for every
 * seeded story and every seeded suggestion alike.
 *
 * Duplicated from the application rather than imported, for the reason
 * `index.ts` gives: `packages/db` must not depend on `apps/app`. What it must
 * match is `apps/app/src/lib/doc/text.ts` — paragraphs joined by a blank line,
 * and a word is a token with a letter or a digit in it — so that a seeded
 * section counts the way a written one does when FR-5.7 asks how long it is.
 */

/** A seeded passage, as the library writes it: a blank line between two paragraphs. */
export function paragraphsOf(text: string): string[] {
  return text
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
}

/**
 * Paragraphs to the restricted document FR-4.1 allows, and nothing else. No
 * paragraphs is one empty paragraph, which is how the application makes an
 * empty section (FR-2.2): ProseMirror needs a block to put the cursor in.
 */
export function docOf(paragraphs: readonly string[]) {
  return {
    type: 'doc',
    content:
      paragraphs.length === 0
        ? [{ type: 'paragraph', content: [] }]
        : paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
  }
}

/** FR-4.3 and FR-13.6 — the columns derived from the text, never written by hand. */
export function deriveOf(paragraphs: readonly string[]) {
  const contentText = paragraphs.join('\n\n')
  let wordCount = 0
  for (const token of contentText.split(/\s+/u)) {
    if (/[\p{L}\p{N}]/u.test(token)) wordCount += 1
  }
  return {
    contentText,
    wordCount,
    contentHash: createHash('sha256').update(contentText, 'utf8').digest('hex'),
  }
}
