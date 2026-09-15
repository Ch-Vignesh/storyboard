/**
 * `.docx` against real files, built here rather than checked in as binaries.
 *
 * Two manuscripts, because they are the two that arrive: one formatted the way
 * Word wants — Heading 1 per chapter — and one formatted the way writers
 * actually type, with chapter names as ordinary paragraphs and no styles
 * anywhere. Phase 5's exit criterion names the second one specifically, and it
 * is the one the cascade has to get right without help.
 */
import { AlignmentType, Document, HeadingLevel, PageBreak, Packer, Paragraph, TextRun } from 'docx'
import { describe, expect, it } from 'vitest'

import { extractDocx } from './extract/docx'
import { analyse } from './index'

const SENTENCE = 'The harbour had been empty for a year before she noticed the difference in it.'

function paragraphs(count: number, from = 0): Paragraph[] {
  return Array.from(
    { length: count },
    (_, index) =>
      new Paragraph({ children: [new TextRun(`${SENTENCE} (${String(from + index)})`)] }),
  )
}

async function build(children: Paragraph[]): Promise<Buffer> {
  const document = new Document({ sections: [{ children }] })
  return Packer.toBuffer(document)
}

describe('a .docx with heading styles', () => {
  it('finds its chapters from the styles, and says that is what it did', async () => {
    const file = await build([
      new Paragraph({ text: 'Chapter one', heading: HeadingLevel.HEADING_1 }),
      ...paragraphs(6),
      new Paragraph({ text: 'Chapter two', heading: HeadingLevel.HEADING_1 }),
      ...paragraphs(6, 6),
    ])

    const proposal = await analyse('docx', file)

    expect(proposal.strategy).toBe('heading-style')
    expect(proposal.chapters.map((chapter) => chapter.title)).toEqual([
      'Chapter one',
      'Chapter two',
    ])
  })

  it('keeps italic and bold, and nothing else about the type', async () => {
    const file = await build([
      new Paragraph({
        children: [
          new TextRun('She was '),
          new TextRun({ text: 'late', italics: true }),
          new TextRun(', and '),
          new TextRun({ text: 'knew', bold: true, size: 48, color: 'FF0000' }),
          new TextRun(' it.'),
        ],
      }),
    ])

    const doc = await extractDocx(file)
    const content = doc.blocks[0]?.json.content ?? []

    expect(doc.blocks[0]?.text).toBe('She was late, and knew it.')
    expect(content.find((node) => node.text === 'late')?.marks).toEqual([{ type: 'em' }])
    expect(content.find((node) => node.text === 'knew')?.marks).toEqual([{ type: 'strong' }])
    // FR-3.7 — colour and size are dropped, and nothing carries them.
    expect(JSON.stringify(doc.blocks)).not.toMatch(/FF0000|size/iu)
  })

  it('reads a page break as a chapter boundary when there are no headings', async () => {
    const file = await build([
      ...paragraphs(4),
      new Paragraph({ children: [new PageBreak()] }),
      ...paragraphs(4, 4),
    ])

    const proposal = await analyse('docx', file)
    expect(proposal.strategy).toBe('page-break')
    expect(proposal.chapters).toHaveLength(2)
  })
})

describe('a .docx with no heading styles at all (the exit criterion)', () => {
  /** Chapter names as ordinary centred paragraphs, scenes divided by asterisks. */
  async function typedByHand(chapters: number, paragraphsPerScene: number): Promise<Buffer> {
    const children: Paragraph[] = []
    for (let index = 1; index <= chapters; index += 1) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun(`Chapter ${String(index)}`)],
        }),
      )
      children.push(...paragraphs(paragraphsPerScene, index * 100))
      children.push(new Paragraph({ children: [new TextRun('***')] }))
      children.push(...paragraphs(paragraphsPerScene, index * 100 + 50))
    }
    return build(children)
  }

  it('finds the chapters from the text, and the scenes from the asterisks', async () => {
    const file = await typedByHand(3, 8)
    const proposal = await analyse('docx', file)

    expect(proposal.strategy).toBe('chapter-line')
    expect(proposal.chapters).toHaveLength(3)
    for (const chapter of proposal.chapters) {
      // The asterisk line divides each chapter into two scenes.
      expect(chapter.sections).toHaveLength(2)
      expect(chapter.sections[0]?.preview.length).toBeGreaterThan(0)
    }
  })

  it('carries an 80,000-word manuscript through in one piece', async () => {
    // 20 chapters of about 4,000 words: the size the exit criterion names.
    const file = await typedByHand(20, 130)
    const proposal = await analyse('docx', file)

    expect(proposal.wordCount).toBeGreaterThan(75_000)
    expect(proposal.tooLong).toBeUndefined()
    expect(proposal.chapters).toHaveLength(20)

    // Nothing was lost between the chapters: every block belongs to exactly one
    // section, and the sections run end to end.
    const sections = proposal.chapters.flatMap((chapter) => chapter.sections)
    const counted = sections.reduce((total, section) => total + section.wordCount, 0)
    expect(counted).toBeGreaterThan(proposal.wordCount * 0.98)
  }, 60_000)
})
