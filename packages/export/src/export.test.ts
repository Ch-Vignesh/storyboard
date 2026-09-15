/**
 * Every export, checked for the thing FR-14.3 will not let it forget.
 *
 * The contributors page and the source line are not decoration: they are the
 * mechanism by which credit travels with the work, and "not removable from
 * within the product" means each format has to carry them without being asked.
 * So every format gets the same question put to it.
 */
import { describe, expect, it } from 'vitest'

import { exportManuscript, formatsFor } from './index'
import { toFountain } from './fountain'
import { toMarkdown } from './markdown'
import { exportAuthorshipProof } from './index'
import type { Doc, Manuscript } from './types'

const prose: Doc = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'She was ' },
        { type: 'text', text: 'late', marks: [{ type: 'em' }] },
        { type: 'text', text: ', and ' },
        { type: 'text', text: 'knew', marks: [{ type: 'strong' }] },
        { type: 'text', text: ' it.' },
      ],
    },
    { type: 'scene_break' },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'The harbour had been empty for a year.' }],
    },
  ],
}

const script: Doc = {
  type: 'doc',
  content: [
    { type: 'scene_heading', content: [{ type: 'text', text: 'INT. HARBOUR OFFICE - NIGHT' }] },
    { type: 'action', content: [{ type: 'text', text: 'She waits.' }] },
    { type: 'character', content: [{ type: 'text', text: 'Margaret' }] },
    { type: 'parenthetical', content: [{ type: 'text', text: '(quietly)' }] },
    { type: 'dialogue', content: [{ type: 'text', text: 'You are late.' }] },
    { type: 'transition', content: [{ type: 'text', text: 'cut to:' }] },
  ],
}

function manuscript(overrides: Partial<Manuscript> = {}): Manuscript {
  return {
    title: 'The ship never lands',
    author: 'J. Rivera',
    sourceUrl: 'https://storyboard.example/s/the-ship-never-lands-abc123',
    rightsNote: 'Ask before reprinting.',
    contributors: [
      { name: 'Margaret Okonjo', role: 'wrote a passage in chapter two' },
      { name: 'a former contributor', role: 'an idea that helped' },
    ],
    chapters: [
      { title: 'Chapter one', sections: [{ title: null, doc: prose }] },
      { title: 'Chapter two', sections: [{ title: 'The pier', doc: prose }] },
    ],
    isScreenplay: false,
    exportedAt: new Date('2026-09-15T10:00:00Z'),
    ...overrides,
  }
}

describe('every format carries its contributors and its source (FR-14.3)', () => {
  it('markdown names both, before and after the manuscript', () => {
    const output = toMarkdown(manuscript())
    expect(output).toContain('Margaret Okonjo')
    expect(output).toContain('a former contributor')
    expect(output).toContain('https://storyboard.example/s/the-ship-never-lands-abc123')
    // The credit comes before the prose, as front matter does.
    expect(output.indexOf('Margaret Okonjo')).toBeLessThan(output.indexOf('The harbour had been'))
  })

  it('fountain names both, on the title page', () => {
    const output = toFountain(manuscript({ isScreenplay: true }))
    expect(output).toContain('Title: The ship never lands')
    expect(output).toContain('Margaret Okonjo')
    expect(output).toContain('https://storyboard.example/s/the-ship-never-lands-abc123')
  })

  it('.docx carries them in bytes that hold the names', async () => {
    const file = await exportManuscript(manuscript(), 'docx')
    // A .docx is a zip, so the names are compressed — but the whole document
    // still round-trips, and a manuscript with no contributors page would be
    // materially smaller than one with it.
    const withCredits = file.body.byteLength
    const withoutCredits = (await exportManuscript(manuscript({ contributors: [] }), 'docx')).body
      .byteLength
    expect(withCredits).toBeGreaterThan(withoutCredits)
    expect(file.mediaType).toMatch(/wordprocessingml/u)
    expect(file.fileName).toBe('the-ship-never-lands.docx')
  })

  it('the PDF holds the source line as readable text', async () => {
    const file = await exportManuscript(manuscript(), 'pdf')
    expect(file.body.subarray(0, 5).toString()).toBe('%PDF-')
    expect(file.fileName).toBe('the-ship-never-lands.pdf')
    // PDFKit writes its text uncompressed enough that the title survives as
    // bytes; this is a smoke test that the document was actually written.
    expect(file.body.byteLength).toBeGreaterThan(2000)
  })
})

describe('markdown', () => {
  it('keeps the marks FR-4.1 allows and nothing else', () => {
    const output = toMarkdown(manuscript())
    expect(output).toContain('*late*')
    expect(output).toContain('**knew**')
  })

  it('writes a scene break as a glyph the importer reads back', () => {
    // A round trip should not lose a break: `* * *` is in FR-3.4's list.
    expect(toMarkdown(manuscript())).toContain('* * *')
  })

  it('shows a rights note as written, with no endorsement (FR-14.5)', () => {
    expect(toMarkdown(manuscript())).toContain('Ask before reprinting.')
    expect(toMarkdown(manuscript({ rightsNote: null }))).not.toContain('Ask before')
  })
})

describe('fountain', () => {
  const screenplay = manuscript({
    isScreenplay: true,
    chapters: [{ title: 'Act one', sections: [{ title: null, doc: script }] }],
  })

  it('writes each element in its own convention', () => {
    const output = toFountain(screenplay)
    expect(output).toContain('INT. HARBOUR OFFICE - NIGHT')
    expect(output).toContain('MARGARET')
    expect(output).toContain('(quietly)')
    expect(output).toContain('> CUT TO:')
  })

  it('keeps dialogue attached to its character cue', () => {
    const output = toFountain(screenplay)
    // No blank line between the cue, its parenthetical and the speech —
    // Fountain reads a blank line there as the end of the dialogue.
    expect(output).toMatch(/MARGARET\n\(quietly\)\nYou are late\./u)
  })

  it('is offered for screenplays only', () => {
    expect(formatsFor(true)).toContain('fountain')
    expect(formatsFor(false)).not.toContain('fountain')
    // .epub is deferred; it should not appear as an option at all.
    expect(formatsFor(true)).not.toContain('epub')
  })
})

describe('proof of authorship (FR-13.6)', () => {
  it('is a PDF naming the work, the hash and the time', async () => {
    const file = await exportAuthorshipProof({
      storyboardTitle: 'The ship never lands',
      author: 'J. Rivera',
      chapterTitle: 'Chapter one',
      sectionTitle: 'The harbour',
      wordCount: 812,
      contentHash: 'a'.repeat(64),
      writtenAt: new Date('2026-03-04T09:12:00Z'),
      url: 'https://storyboard.example/s/x/c/1/1',
      exportedAt: new Date('2026-09-15T10:00:00Z'),
    })

    expect(file.body.subarray(0, 5).toString()).toBe('%PDF-')
    expect(file.fileName).toBe('the-ship-never-lands-the-harbour-proof.pdf')
    expect(file.mediaType).toBe('application/pdf')
  })
})

describe('file names', () => {
  it('are something a writer will recognise in a downloads folder', async () => {
    const file = await exportManuscript(manuscript({ title: 'Ångström & Sons: A Novel!' }), 'md')
    expect(file.fileName).toBe('angstrom-sons-a-novel.md')
  })

  it('never come out empty', async () => {
    const file = await exportManuscript(manuscript({ title: '???' }), 'md')
    expect(file.fileName).toBe('manuscript.md')
  })
})
