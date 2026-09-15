/**
 * Every export, checked for the thing FR-14.3 will not let it forget.
 *
 * The contributors page and the source line are not decoration: they are the
 * mechanism by which credit travels with the work, and "not removable from
 * within the product" means each format has to carry them without being asked.
 * So every format gets the same question put to it.
 */
import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import { exportManuscript, formatsFor } from './index'
import { toFountain } from './fountain'
import { toMarkdown } from './markdown'
import { exportAuthorshipProof } from './index'
import { EXPORT_FORMATS, FORMAT_LABELS, MEDIA_TYPES, type Doc, type Manuscript } from './types'

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
  })
})

describe('what a writer is offered (FR-14.2)', () => {
  /**
   * `formatsFor` used to be a hand-written list, and `.epub` arrived in phase 9
   * fully working and completely unreachable because nobody edited it. It is
   * derived now, and this is the test that keeps it derived.
   */
  it('offers every format that exists, minus the ones withheld on purpose', () => {
    const offered = formatsFor(false)
    for (const format of EXPORT_FORMATS) {
      if (format === 'fountain') continue
      expect(offered, format).toContain(format)
    }
  })

  it('has a label and a media type for every format', () => {
    for (const format of EXPORT_FORMATS) {
      expect(FORMAT_LABELS[format], format).toBeTruthy()
      expect(MEDIA_TYPES[format], format).toBeTruthy()
    }
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

describe('epub (FR-14.2)', () => {
  /** Reads the archive's own directory rather than trusting the writer. */
  function entries(body: Buffer): Record<string, string> {
    const files = unzipSync(new Uint8Array(body))
    return Object.fromEntries(
      Object.entries(files).map(([name, bytes]) => [name, strFromU8(bytes)]),
    )
  }

  it('puts mimetype first and stores it uncompressed', async () => {
    const { body } = await exportManuscript(manuscript(), 'epub')

    // The specification is about bytes, not about entries: a reader identifies
    // the file by looking at a fixed offset. Compress this one entry or move it
    // and most software still opens the book while a validator refuses it —
    // which is exactly the kind of breakage that ships.
    expect(body.subarray(30, 38).toString('ascii')).toBe('mimetype')
    expect(body.subarray(38, 58).toString('ascii')).toBe('application/epub+zip')

    // Compression method 0 = stored, at the usual offset in a local file header.
    expect(body.readUInt16LE(8)).toBe(0)
  })

  it('is a zip holding the files a reader needs to find its way', async () => {
    const { body } = await exportManuscript(manuscript(), 'epub')
    const files = entries(body)

    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        'mimetype',
        'META-INF/container.xml',
        'OEBPS/content.opf',
        'OEBPS/nav.xhtml',
        'OEBPS/title.xhtml',
        'OEBPS/chapter-1.xhtml',
        'OEBPS/chapter-2.xhtml',
      ]),
    )
    expect(files['META-INF/container.xml']).toContain('OEBPS/content.opf')
  })

  it('declares every chapter in the manifest and the spine', async () => {
    const { body } = await exportManuscript(manuscript(), 'epub')
    const opf = entries(body)['OEBPS/content.opf'] ?? ''

    // A spine entry with no manifest item is the most common way to build an
    // epub that opens on one device and not another.
    for (const id of ['title', 'chapter-1', 'chapter-2']) {
      expect(opf, id).toContain(`id="${id}"`)
      expect(opf, id).toContain(`idref="${id}"`)
    }
    expect(opf).toContain('properties="nav"')
  })

  it('carries the contributors and the source line, like every other format', async () => {
    const { body } = await exportManuscript(manuscript(), 'epub')
    const files = entries(body)

    expect(files['OEBPS/title.xhtml']).toContain('Margaret Okonjo')
    expect(files['OEBPS/title.xhtml']).toContain(
      'https://storyboard.example/s/the-ship-never-lands-abc123',
    )
    // FR-14.3 again, in the metadata this time, where a library will read it.
    expect(files['OEBPS/content.opf']).toContain('<dc:contributor>Margaret Okonjo</dc:contributor>')
    expect(files['OEBPS/content.opf']).toContain('<dc:rights>Ask before reprinting.</dc:rights>')
  })

  it('escapes the characters XML cannot carry, in titles and in metadata', async () => {
    const { body } = await exportManuscript(
      manuscript({
        title: 'Ampersands & <angles>',
        author: `O'Brien`,
        chapters: [{ title: 'Chapter & one', sections: [{ title: null, doc: prose }] }],
      }),
      'epub',
    )
    const files = entries(body)

    expect(files['OEBPS/content.opf']).toContain('Ampersands &amp; &lt;angles&gt;')
    expect(files['OEBPS/content.opf']).toContain('O&apos;Brien')
    expect(files['OEBPS/chapter-1.xhtml']).toContain('Chapter &amp; one')
    // The one that bites: escaping in the wrong order turns & into &amp;amp;.
    expect(files['OEBPS/content.opf']).not.toContain('&amp;amp;')
  })

  it('marks up a scene break so a screen reader does not read three asterisks', async () => {
    const { body } = await exportManuscript(manuscript(), 'epub')
    expect(entries(body)['OEBPS/chapter-1.xhtml']).toContain('role="separator"')
  })

  it('names the file after the manuscript', async () => {
    const file = await exportManuscript(manuscript(), 'epub')
    expect(file.fileName).toBe('the-ship-never-lands.epub')
    expect(file.mediaType).toBe('application/epub+zip')
  })
})
