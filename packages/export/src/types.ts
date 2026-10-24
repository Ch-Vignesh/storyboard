/**
 * What an export is made of.
 *
 * Deliberately not Prisma rows: the exporters should be testable with a literal
 * and reusable if the storage ever changes. The application assembles this
 * shape once and hands it to whichever format was asked for.
 */

export const EXPORT_FORMATS = ['docx', 'md', 'pdf', 'epub', 'fountain'] as const
export type ExportFormat = (typeof EXPORT_FORMATS)[number]

export const FORMAT_LABELS: Record<ExportFormat, string> = {
  docx: 'Word (.docx)',
  md: 'Markdown (.md)',
  pdf: 'PDF (.pdf)',
  epub: 'EPUB (.epub)',
  fountain: 'Fountain (.fountain)',
}

export const MEDIA_TYPES: Record<ExportFormat, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  md: 'text/markdown; charset=utf-8',
  pdf: 'application/pdf',
  epub: 'application/epub+zip',
  fountain: 'text/plain; charset=utf-8',
}

export type InlineNode = { type: string; text?: string; marks?: Array<{ type: string }> }
export type BlockNode = {
  type: string
  attrs?: { level?: number }
  content?: InlineNode[] | BlockNode[]
}
export type Doc = { type: 'doc'; content: BlockNode[] }

export type ExportSection = {
  title: string | null
  doc: Doc
}

export type ExportChapter = {
  title: string
  sections: ExportSection[]
}

/** FR-14.3 — who helped, and with what. Not removable from within the product. */
export type ExportContributor = {
  name: string
  role: string
  /** Where their contribution lives, so the claim can be checked (FR-9.6). */
  url?: string
  /**
   * Who this is, when two lines may be one person (a passage and an idea) or
   * two people may share a name: the footer counts people by it (item 8.13).
   * The name stands in when it is absent.
   */
  person?: string
}

export type Manuscript = {
  title: string
  author: string
  /** The storyboard's own address — the footer line FR-14.3 requires. */
  sourceUrl: string
  /** FR-14.5 — free text, shown as the author wrote it, never verified. */
  rightsNote?: string | null
  /**
   * FR-10.3, FR-10.4 — the story a spin-off was taken from. Its words came
   * from there, so the file says so, as the reader does. `author` and `url`
   * are null for an original that is no longer public.
   */
  spunOffFrom?: { title: string; author: string | null; url: string | null } | null
  contributors: ExportContributor[]
  chapters: ExportChapter[]
  /** Screenplays are laid out differently, and .fountain only applies to them. */
  isScreenplay: boolean
  exportedAt: Date
}

/** FR-13.6 — what a proof-of-authorship page has to state. */
export type AuthorshipProof = {
  storyboardTitle: string
  author: string
  sectionTitle: string
  chapterTitle: string
  wordCount: number
  /** sha256 of the section's text, as stored on the revision. */
  contentHash: string
  writtenAt: Date
  /** The version's public record, where anyone can check this (item 8.12, D-11). */
  url: string
  exportedAt: Date
}
