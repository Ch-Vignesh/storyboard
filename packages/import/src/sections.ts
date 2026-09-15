import { countWords } from './extract/blocks'
import type { Block, ProposedSection } from './types'

/**
 * FR-3.4 — section boundaries inside one chapter.
 *
 * Scene-break glyphs first, because a writer who typed `***` meant it. Failing
 * that, a chapter that is still one enormous block of prose is cut every 1200
 * words at a paragraph boundary — not because 1200 is meaningful, but because
 * a section is the unit a contribution request attaches to (FR-5.1), and a
 * chapter-sized one would make every request cover the whole chapter.
 */

/** Architecture section 5's hard split. */
export const HARD_SPLIT_WORDS = 1200

/** FR-3.5 — the first twelve words, for the outline. */
export function previewOf(blocks: Block[], from: number, to: number): string {
  const words: string[] = []
  for (let index = from; index <= to && index < blocks.length && words.length < 12; index += 1) {
    const block = blocks[index]
    if (!block || block.isSceneBreak || block.text.length === 0) continue
    words.push(...block.text.split(/\s+/u))
  }
  const twelve = words.slice(0, 12).join(' ')
  return words.length > 12 ? `${twelve}…` : twelve
}

function sectionFrom(blocks: Block[], from: number, to: number): ProposedSection | null {
  let wordCount = 0
  let hasProse = false
  for (let index = from; index <= to && index < blocks.length; index += 1) {
    const block = blocks[index]
    if (!block) continue
    if (!block.isSceneBreak && block.text.length > 0) hasProse = true
    wordCount += countWords(block.text)
  }
  if (!hasProse) return null
  return { preview: previewOf(blocks, from, to), wordCount, from, to }
}

/**
 * Splits one chapter's blocks into sections.
 *
 * `from` and `to` are indices into the whole document's block list, so a
 * proposal can be edited later without re-parsing the file.
 */
export function detectSections(blocks: Block[], from: number, to: number): ProposedSection[] {
  const cuts: number[] = [from]

  // 1 — an explicit scene break starts the next section after it.
  for (let index = from; index <= to && index < blocks.length; index += 1) {
    if (blocks[index]?.isSceneBreak && index + 1 <= to) cuts.push(index + 1)
  }

  let sections = toSections(blocks, cuts, to)

  // 2 — nothing but one long section: cut on length, at paragraph boundaries.
  if (sections.length === 1 && (sections[0]?.wordCount ?? 0) > HARD_SPLIT_WORDS * 1.5) {
    sections = splitByLength(blocks, from, to)
  }

  return sections.length > 0 ? sections : [{ preview: '', wordCount: 0, from, to }]
}

function toSections(blocks: Block[], cuts: number[], to: number): ProposedSection[] {
  const unique = [...new Set(cuts)].sort((a, b) => a - b)
  const out: ProposedSection[] = []

  for (const [position, start] of unique.entries()) {
    const nextCut = unique[position + 1]
    const end = nextCut === undefined ? to : nextCut - 1
    const section = sectionFrom(blocks, start, end)
    if (section) out.push(section)
  }

  return out
}

function splitByLength(blocks: Block[], from: number, to: number): ProposedSection[] {
  const cuts: number[] = [from]
  let running = 0

  for (let index = from; index <= to && index < blocks.length; index += 1) {
    running += countWords(blocks[index]?.text ?? '')
    if (running >= HARD_SPLIT_WORDS && index + 1 <= to) {
      cuts.push(index + 1)
      running = 0
    }
  }

  // A final scrap of a few hundred words is a worse section than a slightly
  // long one, so it stays attached to the section before it.
  const sections = toSections(blocks, cuts, to)
  if (sections.length > 1) {
    const last = sections.at(-1)
    const previous = sections.at(-2)
    if (last && previous && last.wordCount < HARD_SPLIT_WORDS / 4) {
      previous.to = last.to
      previous.wordCount += last.wordCount
      sections.pop()
    }
  }

  return sections
}
