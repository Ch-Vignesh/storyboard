import { toDocx } from './docx'
import { toEpub } from './epub'
import { fileNamesFor, type FileNames, type FileNaming } from './file-names'
import { toFountain } from './fountain'
import { toMarkdown } from './markdown'
import { toAuthorshipProof, toPdf } from './pdf'
import { EXPORT_FORMATS, MEDIA_TYPES, type ExportFormat, type Manuscript } from './types'

export * from './types'
export { footerLine, frontMatterLines, sourceLine } from './front-matter'
export {
  contentDisposition,
  fileNameFor,
  fileNamesFor,
  type FileNames,
  type FileNaming,
} from './file-names'
export { toDocx } from './docx'
export { toEpub } from './epub'
export { toFountain } from './fountain'
export { toMarkdown } from './markdown'
export { toAuthorshipProof, toPdf } from './pdf'
export { unzipFiles, zipFiles } from './zip'

/** A file to hand over, by both its names (item 8.8, `file-names.ts`). */
export type ExportedFile = FileNames & {
  body: Buffer
  mediaType: string
}

/**
 * FR-14.2 — a manuscript, in the format asked for.
 *
 * All five formats FR-14.2 names are here as of phase 9; `.epub` was the one
 * deferred twice, on the grounds that accepting the format and producing
 * something half-right would be worse than saying plainly that it was missing.
 * `.fountain` is offered for screenplays only: a novel in Fountain would be a
 * screenplay-shaped file full of action lines, which helps nobody.
 *
 * Item 8.8 — the file is named for the day it was made, where the writer is,
 * and for the chapter and version it holds when it is not the whole main
 * draft: `naming` says which, and `exportedAt` is the day.
 */
export async function exportManuscript(
  manuscript: Manuscript,
  format: ExportFormat,
  naming: Omit<FileNaming, 'at'> = {},
): Promise<ExportedFile> {
  const mediaType = MEDIA_TYPES[format]
  const names = fileNamesFor(manuscript.title, format, { ...naming, at: manuscript.exportedAt })

  switch (format) {
    case 'docx':
      return { body: await toDocx(manuscript), ...names, mediaType }
    case 'pdf':
      return { body: await toPdf(manuscript), ...names, mediaType }
    case 'md':
      return { body: Buffer.from(toMarkdown(manuscript), 'utf8'), ...names, mediaType }
    case 'epub':
      return { body: toEpub(manuscript), ...names, mediaType }
    case 'fountain':
      return { body: Buffer.from(toFountain(manuscript), 'utf8'), ...names, mediaType }
  }
}

/** FR-13.6 — the proof page, as a file. */
export async function exportAuthorshipProof(
  proof: Parameters<typeof toAuthorshipProof>[0],
): Promise<ExportedFile> {
  return {
    body: await toAuthorshipProof(proof),
    ...fileNamesFor(`${proof.storyboardTitle} — ${proof.sectionTitle} — proof`, 'pdf'),
    mediaType: 'application/pdf',
  }
}

/**
 * Which formats make sense for this manuscript (FR-14.2).
 *
 * Derived from `EXPORT_FORMATS` by subtraction rather than written out. This
 * was a hand-maintained list, and the cost showed the moment `.epub` was added
 * in phase 9: the format existed, the dispatcher handled it, every test passed,
 * and no writer could have asked for it, because this list had not been
 * touched. Adding a format now offers it; withholding one is a line here with
 * a reason next to it.
 */
export function formatsFor(isScreenplay: boolean): ExportFormat[] {
  return EXPORT_FORMATS.filter((format) => {
    // A novel in Fountain is a screenplay-shaped file full of action lines,
    // which helps nobody.
    if (format === 'fountain') return isScreenplay
    return true
  })
}
