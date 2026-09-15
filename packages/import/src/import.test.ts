/**
 * The import engine, one fixture per format (FR-3.1) and one per strategy in
 * the cascade (FR-3.3).
 *
 * The cases that matter are the ugly ones: a `.docx` with no heading styles at
 * all, which is what most manuscripts actually are, and a chapter that is one
 * unbroken 3,000-word block. Those are where a heuristic either earns its place
 * or proves why FR-3.2 refuses to write anything without a person's say-so.
 */
import { describe, expect, it } from 'vitest'

import { detectChapters } from './chapters'
import { blocksFromPlainText, isSceneBreakLine } from './extract/blocks'
import { extractMarkdown } from './extract/markdown'
import { extractPlainText, extractRtf } from './extract/plain'
import { extractFdx, extractFountain } from './extract/screenplay'
import { analyse, formatOf, propose, IMPORT_LIMITS } from './index'
import { detectSections, HARD_SPLIT_WORDS } from './sections'
import type { Block } from './types'

const sentence = 'The harbour had been empty for a year before she noticed the difference.'

/** Blocks of prose, `count` paragraphs of roughly twelve words each. */
function prose(count: number, from = 0): string {
  return Array.from({ length: count }, (_, index) => `${sentence} (${String(from + index)})`).join(
    '\n\n',
  )
}

describe('reading a file (FR-3.1)', () => {
  it('knows which formats it accepts, and refuses the rest', () => {
    expect(formatOf('manuscript.docx')).toBe('docx')
    expect(formatOf('NOTES.MD')).toBe('md')
    expect(formatOf('script.fountain')).toBe('fountain')
    expect(formatOf('script.fdx')).toBe('fdx')
    expect(formatOf('novel.pages')).toBeNull()
    expect(formatOf('no-extension')).toBeNull()
  })

  it('splits plain text on blank lines and joins wrapped ones', () => {
    const doc = extractPlainText('One line\nwrapped at eighty columns.\n\nA second paragraph.')
    expect(doc.blocks).toHaveLength(2)
    expect(doc.blocks[0]?.text).toBe('One line wrapped at eighty columns.')
    expect(doc.blocks[1]?.text).toBe('A second paragraph.')
  })

  it('reads markdown headings and the marks FR-4.1 allows', () => {
    const doc = extractMarkdown('# Chapter one\n\nShe was *late*, and **knew** it.\n')
    expect(doc.blocks[0]?.style).toBe('Heading 1')
    const marks = doc.blocks[1]?.json.content?.flatMap((node) => node.marks ?? [])
    expect(marks?.map((mark) => mark.type)).toEqual(['em', 'strong'])
  })

  it('drops what FR-3.7 says it drops, and says so', () => {
    const doc = extractMarkdown('| a | b |\n| - | - |\n| 1 | 2 |\n\nProse.\n')
    expect(doc.dropped).toContain('tables')
  })

  it('strips RTF control words and keeps the prose', () => {
    const rtf = String.raw`{\rtf1\ansi{\fonttbl{\f0 Times;}}\f0\fs24 She was late.\par It rained.\par}`
    const doc = extractRtf(rtf)
    expect(doc.blocks.map((block) => block.text)).toEqual(['She was late.', 'It rained.'])
    expect(doc.dropped).toContain('fonts, colours and styles')
  })

  it('reads a fountain screenplay into FR-4.2 element types', () => {
    const doc = extractFountain(
      [
        'INT. HARBOUR OFFICE - NIGHT',
        '',
        'She waits.',
        '',
        'MARGARET',
        '(quietly)',
        'You are late.',
      ].join('\n'),
    )
    expect(doc.blocks.map((block) => block.json.type)).toEqual([
      'scene_heading',
      'action',
      'character',
      'parenthetical',
      'dialogue',
    ])
  })

  it('leaves a fountain title page out of the manuscript', () => {
    const doc = extractFountain(
      'Title: The Ship\nCredit: Written by\nAuthor: J Rivera\n\nFADE IN:\n\nA harbour.',
    )
    expect(doc.dropped).toContain('the title page')
    expect(doc.blocks.every((block) => !block.text.includes('J Rivera'))).toBe(true)
  })

  it('reads Final Draft XML', () => {
    const fdx = `<?xml version="1.0" encoding="UTF-8"?>
      <FinalDraft DocumentType="Script">
        <Content>
          <Paragraph Type="Scene Heading"><Text>EXT. PIER - DAY</Text></Paragraph>
          <Paragraph Type="Action"><Text>Gulls. </Text><Text>Nothing else.</Text></Paragraph>
          <Paragraph Type="Character"><Text>MARGARET</Text></Paragraph>
          <Paragraph Type="Dialogue"><Text>You came.</Text></Paragraph>
        </Content>
      </FinalDraft>`
    const doc = extractFdx(fdx)
    expect(doc.blocks).toHaveLength(4)
    expect(doc.blocks[1]?.text).toBe('Gulls. Nothing else.')
  })

  it('does not throw on a file that is not XML at all', () => {
    const doc = extractFdx('this is not xml <<<')
    expect(doc.blocks).toHaveLength(0)
  })
})

describe('the chapter cascade (FR-3.3)', () => {
  const block = (text: string, style?: string, isPageBreak?: boolean): Block => ({
    text,
    json: { type: 'paragraph' },
    ...(style ? { style } : {}),
    ...(isPageBreak ? { isPageBreak } : {}),
  })

  it('1 — prefers a heading style, and reports that it did', () => {
    const result = detectChapters([
      block('Chapter one', 'Heading 1'),
      block(sentence),
      block('Chapter two', 'Heading 1'),
      block(sentence),
    ])
    expect(result.strategy).toBe('heading-style')
    expect(result.indices).toEqual([0, 2])
    expect(result.titles).toEqual(['Chapter one', 'Chapter two'])
  })

  it('1 — does not treat a scene-level Heading 2 as a chapter', () => {
    const result = detectChapters([
      block('Chapter one', 'Heading 1'),
      block('The harbour', 'Heading 2'),
      block(sentence),
      block('Chapter two', 'Heading 1'),
    ])
    expect(result.indices).toEqual([0, 3])
  })

  it('3 — screenplay scene headings', () => {
    const result = detectChapters([
      block('INT. OFFICE - NIGHT', 'scene_heading'),
      block('She waits.', 'action'),
      block('EXT. PIER - DAY', 'scene_heading'),
    ])
    expect(result.strategy).toBe('screenplay-heading')
    expect(result.indices).toEqual([0, 2])
  })

  it('4 — explicit page breaks, when there are no headings', () => {
    const result = detectChapters([
      block(sentence),
      block(sentence, undefined, true),
      block(sentence),
    ])
    expect(result.strategy).toBe('page-break')
    expect(result.indices).toEqual([0, 1])
  })

  it('5 — a line that says "chapter", in digits, romans or words', () => {
    for (const line of ['Chapter 4', 'CHAPTER IV', 'Chapter four', 'Part Two', 'Act 3']) {
      const result = detectChapters([block(sentence), block(line), block(sentence)])
      expect(result.strategy, line).toBe('chapter-line')
      expect(result.indices, line).toEqual([0, 1])
    }
  })

  it('5 — is not fooled by a sentence that mentions a chapter', () => {
    const result = detectChapters([
      block(sentence),
      block('She had read chapter four twice and still did not believe it.'),
      block(sentence),
    ])
    expect(result.strategy).not.toBe('chapter-line')
  })

  it('6 — a standalone title-case line with no terminal punctuation', () => {
    const result = detectChapters([
      block('The Harbour'),
      block(sentence),
      block('The Lighthouse'),
      block(sentence),
    ])
    expect(result.strategy).toBe('standalone-line')
    expect(result.titles).toEqual(['The Harbour', 'The Lighthouse'])
  })

  it('6 — needs more than one such line before it believes in a structure', () => {
    const result = detectChapters([block('The Harbour'), block(sentence), block(sentence)])
    expect(result.strategy).toBe('none')
  })

  it('7 — gives up honestly, rather than inventing chapters', () => {
    const result = detectChapters(blocksFromPlainText(prose(6)))
    expect(result.strategy).toBe('none')
    expect(result.indices).toEqual([0])
    expect(result.titles).toEqual(['Chapter one'])
  })

  it('keeps an unlabelled opening as its own chapter', () => {
    // A prologue nobody marked, then a labelled chapter: two chapters, not one.
    const result = detectChapters([
      block(sentence),
      block('Chapter one', 'Heading 1'),
      block(sentence),
    ])
    expect(result.indices).toEqual([0, 1])
  })
})

describe('section boundaries (FR-3.4)', () => {
  it('recognises the glyphs writers actually use', () => {
    for (const glyph of ['***', '* * *', '#', '~', '—', '<<<>>>', '~~~', '••••']) {
      expect(isSceneBreakLine(glyph), glyph).toBe(true)
    }
    expect(isSceneBreakLine('She was late.')).toBe(false)
    expect(isSceneBreakLine('#hashtag')).toBe(false)
  })

  it('cuts a section after every scene break', () => {
    const blocks = blocksFromPlainText(
      `${prose(2)}\n\n***\n\n${prose(2, 2)}\n\n***\n\n${prose(2, 4)}`,
    )
    const sections = detectSections(blocks, 0, blocks.length - 1)
    expect(sections).toHaveLength(3)
  })

  it('cuts a monolithic chapter by length, at a paragraph boundary', () => {
    // 300 paragraphs of about 13 words is roughly 3,900 words.
    const blocks = blocksFromPlainText(prose(300))
    const sections = detectSections(blocks, 0, blocks.length - 1)
    expect(sections.length).toBeGreaterThan(1)
    for (const section of sections) {
      expect(section.wordCount).toBeLessThan(HARD_SPLIT_WORDS * 2)
    }
    // Every block landed in exactly one section, in order, with nothing lost.
    expect(sections[0]?.from).toBe(0)
    expect(sections.at(-1)?.to).toBe(blocks.length - 1)
    for (const [index, section] of sections.entries()) {
      const next = sections[index + 1]
      if (next) expect(next.from).toBe(section.to + 1)
    }
  })

  it('leaves a short chapter as one section', () => {
    const blocks = blocksFromPlainText(prose(5))
    expect(detectSections(blocks, 0, blocks.length - 1)).toHaveLength(1)
  })

  it('shows the first twelve words and marks that there are more (FR-3.5)', () => {
    const blocks = blocksFromPlainText(prose(3))
    const [section] = detectSections(blocks, 0, blocks.length - 1)
    expect(section?.preview.split(' ')).toHaveLength(12)
    expect(section?.preview.endsWith('…')).toBe(true)
  })
})

describe('the whole proposal (FR-3.2)', () => {
  it('reads a manuscript with no styles at all — the common case', async () => {
    // What most .docx manuscripts are: no heading styles, chapters typed as
    // plain lines, scenes divided by asterisks.
    const source = [
      'Chapter one',
      '',
      prose(40),
      '',
      '***',
      '',
      prose(40, 40),
      '',
      'Chapter two',
      '',
      prose(40, 80),
    ].join('\n')

    const proposal = await analyse('txt', Buffer.from(source, 'utf8'))

    expect(proposal.strategy).toBe('chapter-line')
    expect(proposal.chapters).toHaveLength(2)
    expect(proposal.chapters[0]?.title).toBe('Chapter one')
    expect(proposal.chapters[0]?.sections).toHaveLength(2)
    expect(proposal.chapters[1]?.sections).toHaveLength(1)
    expect(proposal.wordCount).toBeGreaterThan(1000)
  })

  it('counts an over-long manuscript as over-long rather than truncating it', () => {
    const blocks = Array.from({ length: 10 }, () => ({
      text: 'word '.repeat(40_000).trim(),
      json: { type: 'paragraph' },
    }))
    const proposal = propose('txt', { blocks, footnotes: [], dropped: [] })
    expect(proposal.wordCount).toBeGreaterThan(IMPORT_LIMITS.words)
    expect(proposal.tooLong).toBe(true)
  })

  it('carries what was dropped through to the proposal', () => {
    const proposal = propose('md', {
      blocks: blocksFromPlainText(prose(3)),
      footnotes: [],
      dropped: ['tables'],
    })
    expect(proposal.dropped).toEqual(['tables'])
  })

  it('proposes nothing at all for an empty file', async () => {
    const proposal = await analyse('txt', Buffer.from('', 'utf8'))
    expect(proposal.chapters).toHaveLength(0)
    expect(proposal.wordCount).toBe(0)
  })
})

describe('a zip that is not a manuscript', () => {
  it('refuses an archive that declares far more than it can hold', async () => {
    const { assertReasonableArchive, MAX_UNCOMPRESSED_BYTES } = await import('./extract/zip-guard')
    const { zipSync } = await import('fflate')

    // A megabyte of one repeated byte compresses to almost nothing, which is
    // the shape of the problem: small on the wire, enormous in memory.
    const filler = new Uint8Array(1024 * 1024)
    const archive = Buffer.from(
      zipSync(
        Object.fromEntries(
          Array.from({ length: 100 }, (_, index) => [`part-${String(index)}.bin`, filler]),
        ),
      ),
    )

    expect(archive.byteLength).toBeLessThan(5 * 1024 * 1024)
    expect(100 * filler.byteLength).toBeGreaterThan(MAX_UNCOMPRESSED_BYTES)
    expect(() => assertReasonableArchive(archive)).toThrow(/not what a manuscript looks like/iu)
  })

  it('lets an ordinary archive through', async () => {
    const { assertReasonableArchive } = await import('./extract/zip-guard')
    const { zipSync } = await import('fflate')
    const archive = Buffer.from(
      zipSync({ 'word/document.xml': new TextEncoder().encode('<w:p><w:t>Hello.</w:t></w:p>') }),
    )
    expect(() => assertReasonableArchive(archive)).not.toThrow()
  })

  it('says nothing about a file that is not a zip at all', async () => {
    const { assertReasonableArchive } = await import('./extract/zip-guard')
    expect(() => assertReasonableArchive(Buffer.from('plain text', 'utf8'))).not.toThrow()
  })
})
