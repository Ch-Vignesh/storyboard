/**
 * The one shape everything downstream works on.
 *
 * Six formats come in (FR-3.1) and exactly one structure comes out, so adding
 * a seventh format later touches one file in `extract/` and nothing else. This
 * is architecture section 5's `NormalisedDoc`, spelled out.
 *
 * Also the package's light entry point, `@storyboard/import/types`: nothing in
 * this file loads a parser. Forms, schemas and the upload route import from
 * here; only the code that actually reads a file pulls in the index, and with
 * it mammoth (phase 10, cold starts).
 */

/** The formats FR-3.1 accepts, by extension without the dot. */
export const FORMATS = ['docx', 'md', 'txt', 'rtf', 'fountain', 'fdx'] as const
export type Format = (typeof FORMATS)[number]

/** FR-3.1 — the limits, in one place so the UI and the server agree. */
export const IMPORT_LIMITS = {
  bytes: 5 * 1024 * 1024,
  words: 300_000,
  /** The longest file name accepted (phase 14, item 10.5: it was a bare 255). */
  fileNameChars: 255,
} as const

/** FR-3.1 — the refusal for a file over the size limit, worded from the limit. */
export const TOO_LARGE = `That file is larger than ${String(IMPORT_LIMITS.bytes / (1024 * 1024))} MB.`

export function formatOf(fileName: string): Format | null {
  const extension = fileName.toLowerCase().split('.').pop() ?? ''
  return (FORMATS as readonly string[]).includes(extension) ? (extension as Format) : null
}

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
  /** A scene break read from a run of blank lines rather than a glyph (FR-3.4). */
  fromBlankLines?: boolean
  /**
   * FR-3.7 — the text of footnotes referred to in this block, which go at the
   * end of its section. They went at the end of the whole manuscript until
   * the 2026-10-16 spec review.
   */
  footnotes?: string[]
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

/** FR-3.5 — why a section starts where it does, said per boundary. */
export type SectionReason = 'start' | 'scene-break' | 'blank-lines' | 'length'

export const SECTION_REASON_COPY: Record<SectionReason, string> = {
  start: 'where the chapter starts',
  'scene-break': 'from a scene break',
  'blank-lines': 'from a run of blank lines',
  length: 'guessed from the length',
}

export type ProposedSection = {
  /** First twelve words, for the outline (FR-3.5). */
  preview: string
  /** Why it starts here (FR-3.5). */
  reason: SectionReason
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
  /**
   * FR-3.2 — the opening words of every block, by index, so the review can
   * put a boundary anywhere: move one, or split a section where the writer
   * says rather than in the middle. Display only; commit reads the file
   * again, so nothing here becomes text.
   */
  openings: string[]
}
