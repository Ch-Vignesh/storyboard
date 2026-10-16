import type { Block, TipTapNode } from '../types'

/**
 * Building the blocks every extractor returns.
 *
 * The node vocabulary here is FR-4.1's, exactly: `paragraph`, `heading`,
 * `blockquote`, `scene_break`, the screenplay types, and the marks `em`,
 * `strong`, `strike`. An extractor that invents a node would be caught by the
 * server's schema at commit time, which is too late to be useful — so nothing
 * builds nodes except this file.
 */

/** FR-3.4 — the glyphs a writer uses to mean "time passes". */
const SCENE_BREAK_GLYPHS = new Set(['***', '* * *', '#', '~', '—', '---', '<<<>>>', '§'])

/**
 * True when a line is a scene break rather than prose. Also catches a run of
 * three or more of one glyph (`****`, `~~~`, `• • •`), which is the same
 * intention typed with less care.
 */
export function isSceneBreakLine(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length === 0 || trimmed.length > 24) return false
  if (SCENE_BREAK_GLYPHS.has(trimmed)) return true

  const bare = trimmed.replaceAll(' ', '')
  if (bare.length < 3) return false
  // One repeated non-alphanumeric character: *** ~~~ ••• ---
  return /^([^\p{L}\p{N}\s])\1{2,}$/u.test(bare)
}

export function text(value: string, marks?: string[]): TipTapNode {
  const node: TipTapNode = { type: 'text', text: value }
  if (marks && marks.length > 0) node.marks = marks.map((type) => ({ type }))
  return node
}

export function paragraph(value: string): TipTapNode {
  const trimmed = value.trim()
  return trimmed.length === 0
    ? { type: 'paragraph' }
    : { type: 'paragraph', content: [text(trimmed)] }
}

export function heading(value: string, level: 1 | 2 | 3): TipTapNode {
  const trimmed = value.trim()
  return {
    type: 'heading',
    attrs: { level },
    ...(trimmed.length > 0 ? { content: [text(trimmed)] } : {}),
  }
}

export function sceneBreak(): Block {
  return { text: '', json: { type: 'scene_break' }, isSceneBreak: true }
}

/** A plain paragraph block, or a scene break if that is what the line is. */
export function blockFromLine(line: string): Block {
  if (isSceneBreakLine(line)) return sceneBreak()
  return { text: line.trim(), json: paragraph(line) }
}

/**
 * Splits plain text into paragraph blocks.
 *
 * A blank line ends a paragraph. Single newlines inside one are joined with a
 * space rather than kept as hard breaks: manuscripts wrapped at 80 columns are
 * common, and preserving that wrapping would hard-break every line of the book.
 */
/**
 * FR-3.4 — "a run of two or more blank lines" is a scene break, read as one
 * when it is longer than this manuscript's usual gap between paragraphs. Many
 * manuscripts put two blank lines between every paragraph, and an RTF's empty
 * paragraphs do the same, so taken literally the rule would cut after every
 * paragraph. Runs were not read at all until the 2026-10-16 spec review.
 *
 * Each entry is a block and the blank lines before it.
 */
export function withBlankLineBreaks(
  entries: ReadonlyArray<{ block: Block; blanksBefore: number }>,
): Block[] {
  const gaps = new Map<number, number>()
  for (const [index, entry] of entries.entries()) {
    if (index === 0 || entry.block.isSceneBreak || entries[index - 1]?.block.isSceneBreak) continue
    gaps.set(entry.blanksBefore, (gaps.get(entry.blanksBefore) ?? 0) + 1)
  }
  // The most common gap; the smaller on a tie, which reads fewer breaks.
  let usual = 0
  let seen = -1
  for (const [gap, count] of [...gaps.entries()].sort((a, b) => a[0] - b[0])) {
    if (count > seen) {
      usual = gap
      seen = count
    }
  }

  const out: Block[] = []
  for (const [index, { block, blanksBefore }] of entries.entries()) {
    const run = index > 0 && blanksBefore >= 2 && blanksBefore > usual
    if (run && !block.isSceneBreak && out.length > 0 && !out.at(-1)?.isSceneBreak) {
      out.push({ ...sceneBreak(), fromBlankLines: true })
    }
    out.push(block)
  }
  return out
}

export function blocksFromPlainText(source: string): Block[] {
  const entries: Array<{ block: Block; blanksBefore: number }> = []
  let buffer: string[] = []
  let blanks = 0
  let startBlanks = 0

  const flush = () => {
    if (buffer.length === 0) return
    const joined = buffer.join(' ').replaceAll(/\s+/gu, ' ').trim()
    if (joined.length > 0) entries.push({ block: blockFromLine(joined), blanksBefore: startBlanks })
    buffer = []
  }

  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim()
    if (line.length === 0) {
      flush()
      blanks += 1
      continue
    }
    // A scene break stands alone even without blank lines around it.
    if (isSceneBreakLine(line)) {
      flush()
      entries.push({ block: sceneBreak(), blanksBefore: blanks })
      blanks = 0
      continue
    }
    if (buffer.length === 0) {
      startBlanks = blanks
      blanks = 0
    }
    buffer.push(line)
  }
  flush()

  return withBlankLineBreaks(entries)
}

/** Words, counted the way the rest of the product counts them. */
export function countWords(value: string): number {
  const trimmed = value.trim()
  if (trimmed.length === 0) return 0
  return trimmed.split(/\s+/u).length
}
