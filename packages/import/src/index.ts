import { detectChapters, wordsIn } from './chapters'
import { countWords } from './extract/blocks'
import { extractDocx } from './extract/docx'
import { extractMarkdown } from './extract/markdown'
import { extractPlainText, extractRtf } from './extract/plain'
import { extractFdx, extractFountain } from './extract/screenplay'
import { detectSections } from './sections'
import { FORMATS, type Format, type NormalisedDoc, type Proposal } from './types'

export * from './types'
export { detectChapters } from './chapters'
export { detectSections, previewOf, HARD_SPLIT_WORDS } from './sections'
export { countWords, isSceneBreakLine } from './extract/blocks'
export { SuspiciousArchiveError, MAX_UNCOMPRESSED_BYTES } from './extract/zip-guard'

/** FR-3.1 — the limits, in one place so the UI and the server agree. */
export const IMPORT_LIMITS = {
  bytes: 5 * 1024 * 1024,
  words: 300_000,
} as const

export function formatOf(fileName: string): Format | null {
  const extension = fileName.toLowerCase().split('.').pop() ?? ''
  return (FORMATS as readonly string[]).includes(extension) ? (extension as Format) : null
}

/** Reads a file into the one shape everything downstream works on. */
export async function extract(format: Format, file: Buffer): Promise<NormalisedDoc> {
  switch (format) {
    case 'docx':
      return extractDocx(file)
    case 'md':
      return extractMarkdown(file.toString('utf8'))
    case 'rtf':
      return extractRtf(file.toString('utf8'))
    case 'fountain':
      return extractFountain(file.toString('utf8'))
    case 'fdx':
      return extractFdx(file.toString('utf8'))
    case 'txt':
      return extractPlainText(file.toString('utf8'))
  }
}

/**
 * The whole of stage one (FR-3.2): a file becomes a *proposal*, and nothing
 * else happens. Nothing here writes; the caller shows the result to a person
 * and waits.
 */
export async function analyse(format: Format, file: Buffer): Promise<Proposal> {
  const doc = await extract(format, file)
  return propose(format, doc)
}

/** The detection half, separated so it can be tested without a file. */
export function propose(format: Format, doc: NormalisedDoc): Proposal {
  const { blocks } = doc
  const { indices, strategy, titles } = detectChapters(blocks)

  const chapters = indices.map((start, position) => {
    const nextStart = indices[position + 1]
    const end = nextStart === undefined ? blocks.length - 1 : nextStart - 1
    return {
      title: titles[position] ?? `Chapter ${String(position + 1)}`,
      strategy,
      sections: detectSections(blocks, start, end),
      wordCount: wordsIn(blocks, start, end),
    }
  })

  const wordCount = blocks.reduce((total, block) => total + countWords(block.text), 0)

  return {
    format,
    strategy,
    // A chapter whose every block was a heading and nothing else is a table of
    // contents, not a chapter. Dropping it here saves a correction later.
    chapters: chapters.filter((chapter) => chapter.sections.some((s) => s.wordCount > 0)),
    wordCount,
    dropped: doc.dropped,
    ...(wordCount > IMPORT_LIMITS.words ? { tooLong: true } : {}),
  }
}
