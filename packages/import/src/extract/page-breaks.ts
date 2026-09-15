import { unzipSync, strFromU8 } from 'fflate'

/**
 * Where the page breaks are in a `.docx` (FR-3.3, strategy 4).
 *
 * Mammoth does not carry them: its `br[type='page']` style map produces
 * nothing, and an explicit break arrives as an empty paragraph indistinguishable
 * from a blank line. So the breaks are read from `word/document.xml` directly.
 *
 * What comes back is the *text* each break precedes, in order, rather than an
 * index. Mammoth's output is not one element per `w:p` — headings, lists and
 * empty paragraphs all shift the count — so an index would drift, and text
 * matched in order does not.
 */

/** Paragraph text that begins a page, in document order. */
export type PageStarts = string[]

const PARAGRAPH = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/gu
const TEXT_RUN = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gu
const PAGE_BREAK = /<w:br\s[^>]*w:type="page"/u
const PAGE_BREAK_BEFORE = /<w:pageBreakBefore(?:\s[^>]*)?\/?>/u

function decode(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')
}

export function normalise(value: string): string {
  return value.replaceAll(/\s+/gu, ' ').trim().toLowerCase()
}

export function readPageStarts(file: Buffer): PageStarts {
  let xml: string
  try {
    const zip = unzipSync(new Uint8Array(file), { filter: (f) => f.name === 'word/document.xml' })
    const entry = zip['word/document.xml']
    if (!entry) return []
    xml = strFromU8(entry)
  } catch {
    // Not a readable zip. The caller still has mammoth's own error to report.
    return []
  }

  const starts: PageStarts = []
  let breakPending = false

  for (const match of xml.matchAll(PARAGRAPH)) {
    const body = match[1] ?? ''
    const text = normalise([...body.matchAll(TEXT_RUN)].map((run) => decode(run[1] ?? '')).join(''))

    // A break *before* this paragraph, set as a paragraph property.
    if (PAGE_BREAK_BEFORE.test(body)) breakPending = true

    if (breakPending && text.length > 0) {
      starts.push(text)
      breakPending = false
    }

    // A break inside this paragraph starts the *next* one — unless it sits
    // before this paragraph's own text, which is how Word writes a break that
    // a chapter heading follows on the same line.
    if (PAGE_BREAK.test(body)) {
      const breakAt = body.search(PAGE_BREAK)
      const firstText = body.search(/<w:t(?:\s[^>]*)?>/u)
      if (text.length > 0 && firstText !== -1 && firstText > breakAt) {
        starts.push(text)
      } else {
        breakPending = true
      }
    }
  }

  return starts
}
