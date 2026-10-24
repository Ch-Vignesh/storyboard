/**
 * The start of a piece of text, cut at a word and marked as cut. Used where a
 * card shows the beginning of something a person wrote — a request's ask in
 * the reader's margin (phase 14, item 7.1) — so a word is never broken in half
 * and nothing is cut without saying so.
 */
export function excerpt(text: string, maxChars: number): string {
  const flat = text.replace(/\s+/gu, ' ').trim()
  if (flat.length <= maxChars) return flat
  const cut = flat.slice(0, maxChars)
  const lastSpace = cut.lastIndexOf(' ')
  // Already at a word's end, keep it; one very long word, cut it rather than
  // show nothing.
  const atWord =
    flat[maxChars] === ' ' ? cut : lastSpace > maxChars / 2 ? cut.slice(0, lastSpace) : cut
  return `${atWord.replace(/[\s,;:.!?—–-]+$/u, '')}…`
}
