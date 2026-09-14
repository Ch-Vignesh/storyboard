/**
 * Splitting prose into paragraphs, and normalising them for matching.
 *
 * The split has to agree with `docToText` in the application, which joins
 * blocks with a blank line — that is why the shape of that output is
 * load-bearing rather than cosmetic.
 */

export type Paragraph = {
  /** As written, for display. */
  text: string
  /** Lowercased, punctuation stripped, whitespace collapsed — for matching only. */
  normalised: string
  /** Word bigrams of the normalised form, for the Dice coefficient. */
  bigrams: ReadonlySet<string>
}

/**
 * Normalise for *matching only*. The original is always what gets displayed:
 * a comparison that showed the reader lowercased, depunctuated prose would be
 * worse than useless.
 */
export function normalise(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      // Latin combining diacriticals only, so "café" and "cafe" match. Named by
      // code point rather than written literally, because a combining mark in
      // source is invisible and the next person to read this would not see it.
      .replace(/[̀-ͯ]/g, '')
      // Curly quotes and dashes are the same character as their straight forms
      // for matching purposes; a copy-edit that only smartens quotation marks
      // is not a change to the prose.
      .replace(/[‘’‚‛]/g, "'")
      .replace(/[“”„‟]/g, '"')
      .replace(/[‐-―]/g, '-')
      // Keep letters, digits, and **marks**. `\p{M}` is not optional: a Bengali
      // vowel sign, a Devanagari matra and an Arabic harakat are all category
      // Mark, not Letter, so dropping them would reduce "মেঘ জমেছে" to "ম ঘ জম ছ"
      // and make comparison meaningless in most of the world's scripts.
      .replace(/[^\p{L}\p{N}\p{M}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/** Word bigrams: the unit the Dice coefficient compares. */
export function bigramsOf(normalised: string): Set<string> {
  const words = normalised.split(' ').filter((word) => word.length > 0)
  const bigrams = new Set<string>()
  if (words.length === 0) return bigrams
  if (words.length === 1) {
    // A one-word paragraph has no bigram; use the word so it can still match
    // itself rather than scoring zero against everything.
    bigrams.add(words[0]!)
    return bigrams
  }
  for (let i = 0; i < words.length - 1; i++) {
    bigrams.add(`${words[i]!} ${words[i + 1]!}`)
  }
  return bigrams
}

/** Split flattened text into paragraphs on blank lines. */
export function toParagraphs(text: string): Paragraph[] {
  return text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) => {
      const normalised = normalise(block)
      return { text: block, normalised, bigrams: bigramsOf(normalised) }
    })
}

/**
 * Dice coefficient on word bigrams: twice the shared bigrams over the total.
 * 1 means identical, 0 means nothing in common.
 */
export function dice(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  // Iterate the smaller set; membership tests are O(1) either way.
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  for (const bigram of small) {
    if (large.has(bigram)) shared += 1
  }
  return (2 * shared) / (a.size + b.size)
}
