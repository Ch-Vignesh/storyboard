import { detectChapters, wordsIn } from './chapters'
import { countWords } from './extract/blocks'
import { extractDocx } from './extract/docx'
import { extractMarkdown } from './extract/markdown'
import { extractPlainText, extractRtf } from './extract/plain'
import { extractFdx, extractFountain } from './extract/screenplay'
import { detectSections } from './sections'
import { IMPORT_LIMITS, type Format, type NormalisedDoc, type Proposal } from './types'

export * from './types'
export { detectChapters } from './chapters'
export { detectSections, previewOf, HARD_SPLIT_WORDS } from './sections'
export { countWords, isSceneBreakLine } from './extract/blocks'
export { SuspiciousArchiveError, MAX_UNCOMPRESSED_BYTES } from './extract/zip-guard'

/**
 * A text file's characters, in the encoding it says it is in. Every text
 * format was read as UTF-8, so a file Notepad saved as "Unicode" (UTF-16, a
 * NUL beside every letter) reached the database, which refuses NULs, and the
 * writer was told something went wrong on our side (2026-10-26 final pass,
 * the detective review). UTF-16 is known by its byte-order mark, as Notepad
 * writes it.
 */
export function decodeText(file: Buffer): string {
  if (file[0] === 0xef && file[1] === 0xbb && file[2] === 0xbf) {
    return file.subarray(3).toString('utf8')
  }
  if (file[0] === 0xff && file[1] === 0xfe) return file.subarray(2).toString('utf16le')
  if (file[0] === 0xfe && file[1] === 0xff) {
    // Big-endian: swapped into little-endian, which Node reads.
    const body = Buffer.from(file.subarray(2, 2 + ((file.length - 2) & ~1)))
    return body.swap16().toString('utf16le')
  }
  return file.toString('utf8')
}

const NUL = String.fromCharCode(0)

/**
 * NUL can be stored nowhere in Postgres, and is never part of a manuscript:
 * an RTF Unicode escape or an FDX character reference of zero decodes to one.
 * Taken out of every string in the extracted document.
 */
function withoutNul<T>(value: T): T {
  if (typeof value === 'string') return value.replaceAll(NUL, '') as T
  if (Array.isArray(value)) return value.map((item: unknown) => withoutNul(item)) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, withoutNul(item)]),
    ) as T
  }
  return value
}

/** Reads a file into the one shape everything downstream works on. */
export async function extract(format: Format, file: Buffer): Promise<NormalisedDoc> {
  return withoutNul(await extractRaw(format, file))
}

async function extractRaw(format: Format, file: Buffer): Promise<NormalisedDoc> {
  switch (format) {
    case 'docx':
      return extractDocx(file)
    case 'md':
      return extractMarkdown(decodeText(file))
    case 'rtf':
      return extractRtf(decodeText(file))
    case 'fountain':
      return extractFountain(decodeText(file))
    case 'fdx':
      return extractFdx(decodeText(file))
    case 'txt':
      return extractPlainText(decodeText(file))
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
    openings: blocks.map((block) => (block.isSceneBreak ? '* * *' : openingOf(block.text))),
  }
}

/** Enough of a paragraph to know it by (FR-3.2's boundary picker). */
const OPENING_WORDS = 10

function openingOf(value: string): string {
  const words = value.split(/\s+/u).filter(Boolean)
  const opening = words.slice(0, OPENING_WORDS).join(' ')
  return words.length > OPENING_WORDS ? `${opening}…` : opening
}
