import { countWords } from './extract/blocks'
import type { Block, Strategy } from './types'

/**
 * FR-3.3 — chapter detection, as a cascade of deterministic strategies.
 *
 * First hit wins, and which one hit is returned so the review screen can say
 * "from a heading style" rather than a confidence score (FR-3.5). No AI, by
 * requirement (FR-3.6): every rule here is one a person could apply by eye, and
 * every one of them will sometimes be wrong. That is what the review screen is
 * for, and why nothing is written until somebody confirms it.
 */

/** A boundary is the index of the block that *starts* a chapter. */
export type Boundaries = { indices: number[]; strategy: Strategy; titles: string[] }

const ROMAN = '[ivxlcdm]+'
const SPELLED =
  'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty'

/** FR-3.3 step 5 — a standalone short line that says it is a chapter. */
const CHAPTER_LINE = new RegExp(
  `^\\s*(chapter|part|act|book|section)\\s+([0-9]+|${ROMAN}|${SPELLED})\\b`,
  'iu',
)

/** A line that is only a number, which is how many manuscripts mark chapters. */
const BARE_NUMBER = new RegExp(`^\\s*(?:[0-9]{1,3}|${ROMAN})\\s*$`, 'iu')

const MAX_HEADING_LENGTH = 60

function titleCase(value: string): boolean {
  const words = value.split(/\s+/u).filter((word) => /\p{L}/u.test(word))
  if (words.length === 0) return false
  const capitalised = words.filter((word) => /^\p{Lu}/u.test(word)).length
  // Small words are allowed to stay lower case in a title.
  return capitalised / words.length >= 0.6
}

/** FR-3.3 step 6 — a standalone line that looks like a heading without saying so. */
function looksLikeHeading(blocks: Block[], index: number): boolean {
  const block = blocks[index]
  if (!block || block.isSceneBreak) return false

  const value = block.text.trim()
  if (value.length === 0 || value.length > MAX_HEADING_LENGTH) return false
  if (/[.,;:!?]$/u.test(value)) return false
  if (BARE_NUMBER.test(value)) return true

  const upper = value === value.toUpperCase() && /\p{Lu}/u.test(value)
  if (!upper && !titleCase(value)) return false

  // "Surrounded by blank lines" in a block list means: not a continuation of
  // prose. The block before it, if any, ended a paragraph — which is always
  // true here — so the test that carries weight is that the next block is prose.
  const next = blocks[index + 1]
  return next !== undefined && !next.isSceneBreak && next.text.length > 0
}

function titleFor(blocks: Block[], index: number, fallback: number): string {
  const value = blocks[index]?.text.trim() ?? ''
  if (value.length > 0 && value.length <= 120) return value
  return `Chapter ${String(fallback)}`
}

function from(indices: number[], strategy: Strategy, blocks: Block[]): Boundaries {
  const unique = [...new Set(indices)].sort((a, b) => a - b)
  // A chapter that starts after the first block leaves an orphan opening —
  // front matter, an epigraph, a prologue nobody labelled. It is a chapter too.
  if (unique[0] !== 0) unique.unshift(0)

  return {
    indices: unique,
    strategy,
    titles: unique.map((index, position) => {
      // The block that *named* the chapter is its title only when the strategy
      // found a name there; an implied opening chapter has none.
      const named =
        strategy !== 'none' && (position > 0 || indices.includes(index))
          ? titleFor(blocks, index, position + 1)
          : `Chapter ${String(position + 1)}`
      return named
    }),
  }
}

export function detectChapters(blocks: Block[]): Boundaries {
  if (blocks.length === 0) return { indices: [], strategy: 'none', titles: [] }

  // 1 and 2 — a heading style, from .docx styles or markdown's # and ##.
  const headings = blocks
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => block.style === 'Heading 1' || block.style === 'Heading 2')
  if (headings.length > 0) {
    // Prefer level 1 alone when there are both: in a manuscript with Heading 1
    // per chapter and Heading 2 per scene, every Heading 2 would be a chapter.
    const level1 = headings.filter(({ block }) => block.style === 'Heading 1')
    const chosen = level1.length > 0 ? level1 : headings
    const strategy: Strategy = blocks.some((block) => block.style?.startsWith('Heading'))
      ? 'heading-style'
      : 'markdown-heading'
    return from(
      chosen.map(({ index }) => index),
      strategy,
      blocks,
    )
  }

  // 3 — screenplays: scene headings and act breaks.
  const sceneHeadings = blocks
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => block.style === 'scene_heading')
  if (sceneHeadings.length > 0) {
    return from(
      sceneHeadings.map(({ index }) => index),
      'screenplay-heading',
      blocks,
    )
  }

  // 4 — explicit page breaks.
  const pageBreaks = blocks
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => block.isPageBreak)
  if (pageBreaks.length > 0) {
    return from(
      pageBreaks.map(({ index }) => index),
      'page-break',
      blocks,
    )
  }

  // 5 — a line that says "chapter".
  const chapterLines = blocks
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => !block.isSceneBreak && CHAPTER_LINE.test(block.text))
  if (chapterLines.length > 0) {
    return from(
      chapterLines.map(({ index }) => index),
      'chapter-line',
      blocks,
    )
  }

  // 6 — a standalone line that looks like a heading.
  const standalone = blocks
    .map((_, index) => index)
    .filter((index) => looksLikeHeading(blocks, index))
  // One such line in a whole manuscript is more likely a stray than a structure.
  if (standalone.length > 1) return from(standalone, 'standalone-line', blocks)

  // 7 — nothing matched. One chapter; sections carry the whole burden.
  return { indices: [0], strategy: 'none', titles: ['Chapter one'] }
}

/** Total words in a range of blocks, both ends inclusive. */
export function wordsIn(blocks: Block[], from: number, to: number): number {
  let total = 0
  for (let index = from; index <= to && index < blocks.length; index += 1) {
    total += countWords(blocks[index]?.text ?? '')
  }
  return total
}
