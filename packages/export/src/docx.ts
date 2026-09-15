import {
  AlignmentType,
  Document,
  Footer,
  HeadingLevel,
  PageBreak,
  Packer,
  Paragraph,
  TextRun,
} from 'docx'

import { sourceLine } from './front-matter'
import type { BlockNode, InlineNode, Manuscript } from './types'

/**
 * FR-14.2 — `.docx`, which is what an agent or an editor will ask for.
 *
 * Manuscript format, not book design: one typeface, double spacing, a chapter
 * starting on its own page. Nobody should have to undo a design decision of
 * ours before sending this to a publisher.
 */

const FONT = 'Times New Roman'
const SIZE = 24 // half-points: 12pt
const LINE = 480 // twips: double spacing

function runs(nodes: InlineNode[] | BlockNode[] | undefined): TextRun[] {
  if (!nodes) return []
  return (nodes as InlineNode[])
    .map((node) => {
      if (node.type === 'hard_break') return new TextRun({ text: '', break: 1 })
      if (node.type !== 'text' || !node.text) return null
      const marks = new Set((node.marks ?? []).map((mark) => mark.type))
      return new TextRun({
        text: node.text,
        italics: marks.has('em'),
        bold: marks.has('strong'),
        strike: marks.has('strike'),
      })
    })
    .filter((run): run is TextRun => run !== null)
}

function paragraphsFor(node: BlockNode, isScreenplay: boolean): Paragraph[] {
  const spacing = { line: LINE }

  switch (node.type) {
    case 'heading':
      return [
        new Paragraph({
          heading:
            node.attrs?.level === 1
              ? HeadingLevel.HEADING_2
              : node.attrs?.level === 2
                ? HeadingLevel.HEADING_3
                : HeadingLevel.HEADING_4,
          children: runs(node.content),
        }),
      ]
    case 'blockquote':
      return (node.content as BlockNode[]).map(
        (child) =>
          new Paragraph({
            indent: { left: 720, right: 720 },
            spacing,
            children: runs(child.content),
          }),
      )
    case 'scene_break':
      return [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 240, after: 240 },
          children: [new TextRun('#')],
        }),
      ]
    // FR-4.2's screenplay elements, at the industry indents.
    case 'scene_heading':
      return [
        new Paragraph({
          spacing: { before: 240, line: LINE },
          children: [new TextRun({ text: textOf(node).toUpperCase(), bold: true })],
        }),
      ]
    case 'character':
      return [
        new Paragraph({
          indent: { left: 2160 },
          spacing,
          children: [new TextRun(textOf(node).toUpperCase())],
        }),
      ]
    case 'parenthetical':
      return [new Paragraph({ indent: { left: 1800 }, spacing, children: runs(node.content) })]
    case 'dialogue':
      return [
        new Paragraph({
          indent: { left: 1440, right: 1440 },
          spacing,
          children: runs(node.content),
        }),
      ]
    case 'transition':
      return [
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing,
          children: [new TextRun(textOf(node).toUpperCase())],
        }),
      ]
    default:
      return [
        new Paragraph({
          spacing,
          // Screenplay action is flush left; prose is indented like a novel.
          indent: isScreenplay ? undefined : { firstLine: 720 },
          children: runs(node.content),
        }),
      ]
  }
}

function textOf(node: BlockNode): string {
  return (node.content ?? []).map((child) => ('text' in child ? (child.text ?? '') : '')).join('')
}

export async function toDocx(manuscript: Manuscript): Promise<Buffer> {
  const children: Paragraph[] = []

  // ── Front matter (FR-14.3)
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 2400, after: 240 },
      children: [new TextRun({ text: manuscript.title, bold: true, size: 36 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun(`by ${manuscript.author}`)],
    }),
  )

  if (manuscript.contributors.length > 0) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 720, after: 120 },
        children: [new TextRun({ text: 'With contributions from', bold: true })],
      }),
    )
    for (const contributor of manuscript.contributors) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun(`${contributor.name} — ${contributor.role}`)],
        }),
      )
    }
  }

  if (manuscript.rightsNote && manuscript.rightsNote.trim().length > 0) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 480 },
        children: [new TextRun({ text: manuscript.rightsNote.trim(), italics: true })],
      }),
    )
  }

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 480 },
      children: [new TextRun({ text: sourceLine(manuscript), size: 18 })],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  )

  // ── The manuscript itself
  for (const [index, chapter] of manuscript.chapters.entries()) {
    if (index > 0) children.push(new Paragraph({ children: [new PageBreak()] }))
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 480, after: 480 },
        children: [new TextRun(chapter.title)],
      }),
    )

    for (const section of chapter.sections) {
      if (section.title) {
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun(section.title)],
          }),
        )
      }
      for (const node of section.doc.content) {
        children.push(...paragraphsFor(node, manuscript.isScreenplay))
      }
    }
  }

  const document = new Document({
    creator: manuscript.author,
    title: manuscript.title,
    styles: {
      default: {
        document: { run: { font: FONT, size: SIZE } },
      },
    },
    sections: [
      {
        // FR-14.3 — the source line on every page, not only the first.
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: sourceLine(manuscript), size: 16 })],
              }),
            ],
          }),
        },
        children,
      },
    ],
  })

  return Packer.toBuffer(document)
}
