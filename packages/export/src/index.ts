import { toDocx } from './docx'
import { fileNameFor } from './front-matter'
import { toFountain } from './fountain'
import { toMarkdown } from './markdown'
import { toAuthorshipProof, toPdf } from './pdf'
import { MEDIA_TYPES, type ExportFormat, type Manuscript } from './types'

export * from './types'
export { fileNameFor, frontMatterLines, sourceLine } from './front-matter'
export { toDocx } from './docx'
export { toFountain } from './fountain'
export { toMarkdown } from './markdown'
export { toAuthorshipProof, toPdf } from './pdf'

export type ExportedFile = {
  body: Buffer
  fileName: string
  mediaType: string
}

/**
 * FR-14.2 — a manuscript, in the format asked for.
 *
 * `.epub` is deferred (phase 7 or later), and saying so here rather than
 * accepting the format and producing something half-right is the honest option.
 * `.fountain` is offered for screenplays only: a novel in Fountain would be a
 * screenplay-shaped file full of action lines, which helps nobody.
 */
export async function exportManuscript(
  manuscript: Manuscript,
  format: ExportFormat,
): Promise<ExportedFile> {
  const mediaType = MEDIA_TYPES[format]

  switch (format) {
    case 'docx':
      return {
        body: await toDocx(manuscript),
        fileName: fileNameFor(manuscript.title, 'docx'),
        mediaType,
      }
    case 'pdf':
      return {
        body: await toPdf(manuscript),
        fileName: fileNameFor(manuscript.title, 'pdf'),
        mediaType,
      }
    case 'md':
      return {
        body: Buffer.from(toMarkdown(manuscript), 'utf8'),
        fileName: fileNameFor(manuscript.title, 'md'),
        mediaType,
      }
    case 'fountain':
      return {
        body: Buffer.from(toFountain(manuscript), 'utf8'),
        fileName: fileNameFor(manuscript.title, 'fountain'),
        mediaType,
      }
  }
}

/** FR-13.6 — the proof page, as a file. */
export async function exportAuthorshipProof(
  proof: Parameters<typeof toAuthorshipProof>[0],
): Promise<ExportedFile> {
  return {
    body: await toAuthorshipProof(proof),
    fileName: fileNameFor(`${proof.storyboardTitle}-${proof.sectionTitle}-proof`, 'pdf'),
    mediaType: 'application/pdf',
  }
}

/** Which formats make sense for this manuscript (FR-14.2). */
export function formatsFor(isScreenplay: boolean): ExportFormat[] {
  return isScreenplay ? ['docx', 'pdf', 'md', 'fountain'] : ['docx', 'pdf', 'md']
}
