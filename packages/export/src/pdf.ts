import PDFDocument from 'pdfkit'

import { sourceLine } from './front-matter'
import type { AuthorshipProof, BlockNode, InlineNode, Manuscript } from './types'

/**
 * FR-14.2 — `.pdf`, and FR-13.6's proof of authorship.
 *
 * PDFKit rather than a headless browser: a browser would mean shipping Chrome
 * to render a document made of paragraphs, and the export is meant to be
 * something a server can do in a request. The built-in Times and Courier faces
 * cover both manuscript and screenplay, so no font files travel with the code.
 */

const MARGIN = 72 // one inch
const BODY = 12
const LEADING = 1.6

type Pdf = InstanceType<typeof PDFDocument>

function bufferOf(document: Pdf): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    document.on('data', (chunk: Buffer) => chunks.push(chunk))
    document.on('end', () => resolve(Buffer.concat(chunks)))
    document.on('error', reject)
    document.end()
  })
}

/** Writes one block's inline content, carrying italic and bold across runs. */
function writeInline(
  document: Pdf,
  nodes: InlineNode[] | BlockNode[] | undefined,
  base: string,
  options: PDFKit.Mixins.TextOptions = {},
): void {
  const runs = (nodes ?? []) as InlineNode[]
  if (runs.length === 0) {
    document.text(' ', options)
    return
  }

  runs.forEach((node, index) => {
    const last = index === runs.length - 1
    if (node.type === 'hard_break') {
      document.text('', { ...options, continued: !last })
      return
    }
    if (node.type !== 'text' || !node.text) return

    const marks = new Set((node.marks ?? []).map((mark) => mark.type))
    const suffix =
      marks.has('strong') && marks.has('em')
        ? '-BoldOblique'
        : marks.has('strong')
          ? '-Bold'
          : marks.has('em')
            ? '-Oblique'
            : ''
    // Times names its italic "Italic"; Courier names it "Oblique".
    const face =
      base === 'Times-Roman' && suffix
        ? `Times${suffix.replace('Oblique', 'Italic').replace('-Bold-Italic', '-BoldItalic')}`
        : `${base}${suffix}`

    document.font(safeFont(face, base))
    document.text(node.text, { ...options, continued: !last })
  })

  document.font(base)
}

/** PDFKit throws on an unknown face; fall back rather than fail an export. */
function safeFont(name: string, fallback: string): string {
  const known = new Set([
    'Times-Roman',
    'Times-Bold',
    'Times-Italic',
    'Times-BoldItalic',
    'Courier',
    'Courier-Bold',
    'Courier-Oblique',
    'Courier-BoldOblique',
    'Helvetica',
    'Helvetica-Bold',
    'Helvetica-Oblique',
  ])
  return known.has(name) ? name : fallback
}

function writeBlock(document: Pdf, node: BlockNode, base: string, isScreenplay: boolean): void {
  const width = document.page.width - MARGIN * 2

  switch (node.type) {
    case 'heading':
      document
        .moveDown(0.8)
        .fontSize(BODY + 3)
        .font(safeFont(`${base}-Bold`, base))
      writeInline(document, node.content, safeFont(`${base}-Bold`, base))
      document.fontSize(BODY).font(base).moveDown(0.4)
      return
    case 'blockquote':
      for (const child of node.content as BlockNode[]) {
        document.fontSize(BODY)
        writeInline(document, child.content, base, { indent: 36, width: width - 72 })
      }
      document.moveDown(0.4)
      return
    case 'scene_break':
      document.moveDown(0.6).text('#', { align: 'center' }).moveDown(0.6)
      return
    case 'scene_heading':
      document.moveDown(0.8).font(safeFont(`${base}-Bold`, base))
      document.text(textOf(node).toUpperCase())
      document.font(base).moveDown(0.3)
      return
    case 'character':
      document.moveDown(0.5).text(textOf(node).toUpperCase(), { indent: 144 })
      return
    case 'parenthetical':
      document.text(textOf(node), { indent: 108 })
      return
    case 'dialogue':
      writeInline(document, node.content, base, { indent: 72, width: width - 144 })
      return
    case 'transition':
      document.moveDown(0.5).text(textOf(node).toUpperCase(), { align: 'right' }).moveDown(0.3)
      return
    default:
      writeInline(document, node.content, base, {
        indent: isScreenplay ? 0 : 24,
        align: 'left',
      })
      document.moveDown(isScreenplay ? 0.5 : 0.2)
  }
}

function textOf(node: BlockNode): string {
  return (node.content ?? []).map((child) => ('text' in child ? (child.text ?? '') : '')).join('')
}

export async function toPdf(manuscript: Manuscript): Promise<Buffer> {
  const base = manuscript.isScreenplay ? 'Courier' : 'Times-Roman'
  const document = new PDFDocument({
    size: 'A4',
    margins: { top: MARGIN, bottom: MARGIN + 24, left: MARGIN, right: MARGIN },
    info: { Title: manuscript.title, Author: manuscript.author },
    // The source line goes in the bottom margin of every page, so it is added
    // by hand below rather than by the default auto page handling.
    bufferPages: true,
  })

  document
    .font(base)
    .fontSize(BODY)
    .lineGap(BODY * (LEADING - 1))

  // ── Front matter (FR-14.3)
  document.moveDown(6)
  document
    .fontSize(22)
    .font(safeFont(`${base}-Bold`, base))
    .text(manuscript.title, { align: 'center' })
  document.fontSize(BODY).font(base).moveDown(0.6)
  document.text(`by ${manuscript.author}`, { align: 'center' })

  if (manuscript.contributors.length > 0) {
    document.moveDown(2)
    document
      .font(safeFont(`${base}-Bold`, base))
      .text('With contributions from', { align: 'center' })
    document.font(base).moveDown(0.5)
    for (const contributor of manuscript.contributors) {
      document.text(`${contributor.name} — ${contributor.role}`, { align: 'center' })
    }
  }

  if (manuscript.rightsNote && manuscript.rightsNote.trim().length > 0) {
    document.moveDown(1.5)
    document
      .font(safeFont(base === 'Courier' ? 'Courier-Oblique' : 'Times-Italic', base))
      .fontSize(BODY - 1)
      .text(manuscript.rightsNote.trim(), { align: 'center' })
    document.font(base).fontSize(BODY)
  }

  // ── The manuscript
  for (const chapter of manuscript.chapters) {
    document.addPage()
    document.moveDown(2)
    document
      .fontSize(BODY + 5)
      .font(safeFont(`${base}-Bold`, base))
      .text(chapter.title)
    document.fontSize(BODY).font(base).moveDown(1)

    for (const section of chapter.sections) {
      if (section.title) {
        document
          .moveDown(0.5)
          .font(safeFont(`${base}-Bold`, base))
          .text(section.title)
        document.font(base).moveDown(0.4)
      }
      for (const node of section.doc.content) {
        writeBlock(document, node, base, manuscript.isScreenplay)
      }
    }
  }

  // FR-14.3 — the source on every page, written after the fact so that it lands
  // on pages the flow created as well as the ones we asked for.
  const range = document.bufferedPageRange()
  for (let index = range.start; index < range.start + range.count; index += 1) {
    document.switchToPage(index)
    document
      .font(base)
      .fontSize(8)
      .text(sourceLine(manuscript), MARGIN, document.page.height - MARGIN + 4, {
        align: 'center',
        width: document.page.width - MARGIN * 2,
        lineBreak: false,
      })
  }

  return bufferOf(document)
}

/**
 * FR-13.6 — a page that says who wrote what, when, and what it hashed to.
 *
 * This is not a legal instrument and does not pretend to be one. It is a
 * statement of what the database recorded, in a form somebody can attach to a
 * claim; the honest framing is on the page itself, because a document that
 * looks more authoritative than it is would be worse than none.
 */
export async function toAuthorshipProof(proof: AuthorshipProof): Promise<Buffer> {
  const document = new PDFDocument({
    size: 'A4',
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    info: { Title: `Proof of authorship — ${proof.sectionTitle}`, Author: proof.author },
  })

  const label = (name: string, value: string) => {
    document.font('Helvetica-Bold').fontSize(9).text(name.toUpperCase(), { characterSpacing: 0.4 })
    document.font('Helvetica').fontSize(12).text(value)
    document.moveDown(0.8)
  }

  document.font('Helvetica-Bold').fontSize(18).text('Proof of authorship')
  document.moveDown(0.3)
  document
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#55636d')
    .text(
      'A record of what was stored, and when. It is evidence of a timestamp, not a ruling on ' +
        'authorship, and it makes no legal claim.',
      { width: 380 },
    )
  document.fillColor('#000000').moveDown(1.5)

  label('Storyboard', proof.storyboardTitle)
  label('Author', proof.author)
  label('Chapter', proof.chapterTitle)
  label('Section', proof.sectionTitle)
  label('Words', proof.wordCount.toLocaleString('en-GB'))
  label('Written', proof.writtenAt.toISOString())
  label('Address', proof.url)

  document.font('Helvetica-Bold').fontSize(9).text('SHA-256 OF THE TEXT', { characterSpacing: 0.4 })
  document.font('Courier').fontSize(10).text(proof.contentHash, { width: 400 })
  document.moveDown(1.5)

  document
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#55636d')
    .text(
      `Issued ${proof.exportedAt.toISOString()}. The hash is of the section's plain text as ` +
        'stored. Anyone holding the same text can compute it and compare.',
      { width: 400 },
    )

  return bufferOf(document)
}
