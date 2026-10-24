/**
 * FR-14.2 (phase 14, item 8.8) — what an exported file is called.
 *
 * A file goes by two names. The ASCII one, `{title slug or "story"}-{yyyy-mm-dd}
 * [-chapter-n][-version][-extra].ext`, is what any client can carry in a quoted
 * `filename`. The real one carries the title as the writer wrote it, in its
 * own script, in RFC 5987's `filename*`, which every current browser prefers.
 * Until item 8.8 there was only the first, from the title alone, so a Hindi
 * or Japanese title downloaded as `manuscript.docx`.
 *
 * Both are built here, from one set of parts, so they cannot drift apart: a
 * later part (an edition's number, item 7b.3) is one more field in
 * `FileNaming`, given once as words and written into each name in its style.
 */

export type FileNaming = {
  /** When the file was made. The name carries this day where the writer is. */
  at?: Date
  /** The writer's time zone (item 1.18); UTC when absent. */
  timeZone?: string
  /** One chapter's number, as the reader counts them, when only it was taken. */
  chapter?: number | null
  /** An alternate version's name; nothing for the main draft. */
  version?: string | null
  /** Any further part, in words, written last: `edition 3`, say (item 7b.3). */
  extra?: string | null
}

export type FileNames = {
  /** Lower-case ASCII, for the quoted `filename`. Never empty. */
  fileName: string
  /** The title as written, for RFC 5987's `filename*`. */
  realFileName: string
}

/** Lower-case ASCII words joined by hyphens: accents folded, everything else dropped. */
function slugPart(value: string, max: number): string {
  return value
    .normalize('NFKD')
    .replaceAll(/[^\w\s-]+/gu, '')
    .trim()
    .replaceAll(/[\s_-]+/gu, '-')
    .slice(0, max)
    .replaceAll(/^-+|-+$/gu, '')
    .toLowerCase()
}

const graphemes = new Intl.Segmenter('en', { granularity: 'grapheme' })

/**
 * The words as written, minus what no file system takes: the characters
 * Windows refuses, the path separators, and control characters. Cut by whole
 * characters as a reader sees them, so a long Devanagari title does not lose
 * half a conjunct.
 */
function realPart(value: string, max: number): string {
  const cleaned = value
    .replaceAll(/[\\/:*?"<>|\p{Cc}]+/gu, ' ')
    .replaceAll(/\s+/gu, ' ')
    .trim()
  return [...graphemes.segment(cleaned)]
    .slice(0, max)
    .map((entry) => entry.segment)
    .join('')
    .trim()
}

/** The calendar day of an instant in a zone, as `yyyy-mm-dd`. */
function dayOf(at: Date, timeZone = 'UTC'): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at)
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

/** Both names of a file, from one set of parts. See the note at the top. */
export function fileNamesFor(title: string, extension: string, naming: FileNaming = {}): FileNames {
  const day = naming.at ? dayOf(naming.at, naming.timeZone) : null
  const chapter = naming.chapter ? `chapter ${String(naming.chapter)}` : null
  const version = naming.version ? realPart(naming.version, 60) : null
  const extra = naming.extra ? realPart(naming.extra, 40) : null

  const ascii = [
    slugPart(title, 80) || 'story',
    day,
    chapter ? slugPart(chapter, 20) : null,
    version === null ? null : slugPart(version, 40) || 'version',
    extra === null ? null : slugPart(extra, 40),
  ].filter((part) => part !== null && part.length > 0)

  const real = [
    realPart(title, 120) || 'Story',
    day,
    chapter,
    version ? `(${version})` : null,
    extra,
  ].filter((part) => part !== null && part.length > 0)

  return {
    fileName: `${ascii.join('-')}.${extension}`,
    realFileName: `${real.join(' ')}.${extension}`,
  }
}

/** A file name a writer will recognise in their downloads folder: the ASCII one. */
export function fileNameFor(title: string, extension: string, naming: FileNaming = {}): string {
  return fileNamesFor(title, extension, naming).fileName
}

/**
 * The `Content-Disposition` header for a download: the ASCII name, quoted,
 * for any client, and the real one as RFC 5987's `filename*` (UTF-8,
 * percent-encoded down to its attr-chars), which a browser prefers.
 */
export function contentDisposition(names: FileNames): string {
  const encoded = encodeURIComponent(names.realFileName).replaceAll(
    /['()*]/gu,
    (char) => `%${(char.codePointAt(0) ?? 0).toString(16).toUpperCase()}`,
  )
  return `attachment; filename="${names.fileName}"; filename*=UTF-8''${encoded}`
}
