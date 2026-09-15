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
export function blocksFromPlainText(source: string): Block[] {
  const blocks: Block[] = []
  let buffer: string[] = []

  const flush = () => {
    if (buffer.length === 0) return
    const joined = buffer.join(' ').replaceAll(/\s+/gu, ' ').trim()
    if (joined.length > 0) blocks.push(blockFromLine(joined))
    buffer = []
  }

  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim()
    if (line.length === 0) {
      flush()
      continue
    }
    // A scene break stands alone even without blank lines around it.
    if (isSceneBreakLine(line)) {
      flush()
      blocks.push(sceneBreak())
      continue
    }
    buffer.push(line)
  }
  flush()

  return blocks
}

/** Words, counted the way the rest of the product counts them. */
export function countWords(value: string): number {
  const trimmed = value.trim()
  if (trimmed.length === 0) return 0
  return trimmed.split(/\s+/u).length
}
