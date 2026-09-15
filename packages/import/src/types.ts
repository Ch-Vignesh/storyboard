/**
 * The one shape everything downstream works on.
 *
 * Six formats come in (FR-3.1) and exactly one structure comes out, so adding
 * a seventh format later touches one file in `extract/` and nothing else. This
 * is architecture section 5's `NormalisedDoc`, spelled out.
 */

/** The formats FR-3.1 accepts, by extension without the dot. */
export const FORMATS = ['docx', 'md', 'txt', 'rtf', 'fountain', 'fdx'] as const
export type Format = (typeof FORMATS)[number]

/**
 * A block is a paragraph-sized piece of the document.
 *
 * `text` is what the detectors read. `json` is the TipTap node that will become
 * prose — carrying only what FR-3.7 promises to preserve. `style` is the
 * source's own name for it (`Heading 1`, `scene_heading`), which is how the
 * cascade knows a heading from a sentence that happens to be short.
 */
export type Block = {
  text: string
  json: TipTapNode
  style?: string
  /** A `.docx` explicit page break sits *before* this block (FR-3.3 step 4). */
  isPageBreak?: boolean
  /** A scene-break glyph line (FR-3.4); the text itself is not prose. */
  isSceneBreak?: boolean
}

/** A restricted ProseMirror node — the same vocabulary the editor allows. */
export type TipTapNode = {
  type: string
  attrs?: Record<string, unknown>
  content?: TipTapNode[]
  marks?: Array<{ type: string }>
  text?: string
}

export type NormalisedDoc = {
  blocks: Block[]
  /** Footnote text, appended at the end of the section it came from (FR-3.7). */
  footnotes: string[]
  /** What was dropped on the way in, for the review screen to be honest about. */
  dropped: string[]
}

/**
 * Which of FR-3.3's seven strategies fired. The review screen turns this into
 * words — "from a heading style" — and never into a number (FR-3.5).
 */
export const STRATEGIES = [
  'heading-style',
  'markdown-heading',
  'screenplay-heading',
  'page-break',
  'chapter-line',
  'standalone-line',
  'none',
] as const
export type Strategy = (typeof STRATEGIES)[number]

/** FR-3.5 — confidence in words, one phrase per strategy. */
export const STRATEGY_COPY: Record<Strategy, string> = {
  'heading-style': 'from a heading style',
  'markdown-heading': 'from a heading',
  'screenplay-heading': 'from a scene heading',
  'page-break': 'from a page break',
  'chapter-line': 'from a line that says "chapter"',
  'standalone-line': 'guessed from the text',
  none: 'guessed from the text',
}

export type ProposedSection = {
  /** First twelve words, for the outline (FR-3.5). */
  preview: string
  wordCount: number
  /** Indices into the chapter's block list, both inclusive. */
  from: number
  to: number
}

export type ProposedChapter = {
  title: string
  /** Why the boundary was put here (FR-3.5). */
  strategy: Strategy
  sections: ProposedSection[]
  wordCount: number
}

export type Proposal = {
  format: Format
  /** The cascade step that produced the chapters, for the review screen. */
  strategy: Strategy
  chapters: ProposedChapter[]
  wordCount: number
  dropped: string[]
  /** Set when the file parsed but broke a limit in FR-3.1. */
  tooLong?: boolean
}
