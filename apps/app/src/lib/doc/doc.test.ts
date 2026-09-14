import { describe, expect, it } from 'vitest'

import {
  emptyDoc,
  flavourForStoryType,
  parseDoc,
  safeParseDoc,
  type ProseDoc,
  type StoryboardDoc,
} from './schema'
import { countWords, derive, docToText, hashContent, isEmptyDoc } from './text'

type ProseBlock = ProseDoc['content'][number]
type Paragraph = Extract<ProseBlock, { type: 'paragraph' }>

const prose = (...content: ProseBlock[]): ProseDoc => ({ type: 'doc', content })
const para = (text: string): Paragraph => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
})

describe('the restricted schema (FR-4.1)', () => {
  it('accepts the full prose node set', () => {
    const doc = prose(
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Four' }] },
      para('She left the harbour before dawn.'),
      { type: 'blockquote', content: [para('A quoted line.')] },
      { type: 'scene_break' },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Then ' },
          { type: 'text', text: 'everything', marks: [{ type: 'em' }] },
          { type: 'text', text: ' changed.' },
          { type: 'hard_break' },
        ],
      },
    )
    expect(() => parseDoc(doc)).not.toThrow()
  })

  it('accepts all three marks and no others', () => {
    for (const type of ['em', 'strong', 'strike'] as const) {
      const doc = prose({
        type: 'paragraph',
        content: [{ type: 'text', text: 'word', marks: [{ type }] }],
      })
      expect(safeParseDoc(doc).success).toBe(true)
    }
    // Deliberately outside the schema, so it cannot be built from the types.
    const withLink = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'word', marks: [{ type: 'link' }] }] },
      ],
    }
    expect(safeParseDoc(withLink).success).toBe(false)
  })

  it('refuses nodes outside the set', () => {
    for (const node of [
      { type: 'image', attrs: { src: 'x.png' } },
      { type: 'table', content: [] },
      { type: 'bullet_list', content: [] },
      { type: 'code_block', content: [] },
      { type: 'horizontal_rule' },
    ]) {
      expect(safeParseDoc({ type: 'doc', content: [node] }).success).toBe(false)
    }
  })

  it('refuses headings below level 3', () => {
    const level4 = {
      type: 'doc',
      content: [{ type: 'heading', attrs: { level: 4 }, content: [] }],
    }
    expect(safeParseDoc(level4).success).toBe(false)
  })

  it('refuses a quote nested in a quote', () => {
    const nested = {
      type: 'doc',
      content: [{ type: 'blockquote', content: [{ type: 'blockquote', content: [para('deep')] }] }],
    }
    expect(safeParseDoc(nested).success).toBe(false)
  })

  it('refuses anything that is not a doc', () => {
    expect(safeParseDoc({ type: 'paragraph' }).success).toBe(false)
    expect(safeParseDoc('<p>hello</p>').success).toBe(false)
    expect(safeParseDoc(null).success).toBe(false)
  })
})

describe('the screenplay node set (FR-4.2)', () => {
  const screenplay: StoryboardDoc = {
    type: 'doc',
    content: [
      { type: 'scene_heading', content: [{ type: 'text', text: 'INT. HARBOUR OFFICE - DAWN' }] },
      { type: 'action', content: [{ type: 'text', text: 'RUTH stands at the window.' }] },
      { type: 'character', content: [{ type: 'text', text: 'RUTH' }] },
      { type: 'parenthetical', content: [{ type: 'text', text: '(not turning)' }] },
      { type: 'dialogue', content: [{ type: 'text', text: 'The tide went out an hour ago.' }] },
      { type: 'transition', content: [{ type: 'text', text: 'CUT TO:' }] },
    ],
  }

  it('accepts every screenplay element', () => {
    expect(safeParseDoc(screenplay, 'screenplay').success).toBe(true)
  })

  it('refuses screenplay elements in a prose storyboard', () => {
    expect(safeParseDoc(screenplay, 'prose').success).toBe(false)
  })

  it('refuses headings and quotes in a screenplay', () => {
    const withHeading = {
      type: 'doc',
      content: [{ type: 'heading', attrs: { level: 1 }, content: [] }],
    }
    expect(safeParseDoc(withHeading, 'screenplay').success).toBe(false)
  })

  it.each([
    ['SCREENPLAY', 'screenplay'],
    ['STAGE_PLAY', 'screenplay'],
    ['NOVEL', 'prose'],
    ['POETRY', 'prose'],
    ['NONFICTION', 'prose'],
    ['OTHER', 'prose'],
  ])('%s uses the %s node set', (storyType, expected) => {
    expect(flavourForStoryType(storyType)).toBe(expected)
  })
})

describe('emptyDoc (FR-2.2)', () => {
  it('is a valid document with one empty block', () => {
    expect(safeParseDoc(emptyDoc()).success).toBe(true)
    expect(safeParseDoc(emptyDoc('screenplay'), 'screenplay').success).toBe(true)
  })

  it('has no words', () => {
    expect(isEmptyDoc(emptyDoc())).toBe(true)
    expect(derive(emptyDoc()).wordCount).toBe(0)
  })
})

describe('docToText (FR-4.3)', () => {
  it('separates blocks with a blank line, because comparison splits on those', () => {
    expect(docToText(prose(para('One.'), para('Two.')))).toBe('One.\n\nTwo.')
  })

  it('keeps a hard break inside its paragraph', () => {
    // A poem must not diff as one paragraph per line (architecture section 4).
    const poem = prose({
      type: 'paragraph',
      content: [
        { type: 'text', text: 'the tide went out' },
        { type: 'hard_break' },
        { type: 'text', text: 'and did not come back' },
      ],
    })
    expect(docToText(poem)).toBe('the tide went out\nand did not come back')
  })

  it('flattens a quote to its paragraphs', () => {
    const doc = prose(para('He wrote:'), {
      type: 'blockquote',
      content: [para('Nothing here is true.')],
    })
    expect(docToText(doc)).toBe('He wrote:\n\nNothing here is true.')
  })

  it('drops scene breaks but keeps the blocks around them apart', () => {
    const doc = prose(para('Before.'), { type: 'scene_break' }, para('After.'))
    expect(docToText(doc)).toBe('Before.\n\nAfter.')
  })

  it('includes heading text', () => {
    const doc = prose(
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Chapter four' }] },
      para('It began badly.'),
    )
    expect(docToText(doc)).toBe('Chapter four\n\nIt began badly.')
  })

  it('joins marked runs without inventing whitespace', () => {
    const doc = prose({
      type: 'paragraph',
      content: [
        { type: 'text', text: 'She was ' },
        { type: 'text', text: 'certain', marks: [{ type: 'strong' }] },
        { type: 'text', text: '.' },
      ],
    })
    expect(docToText(doc)).toBe('She was certain.')
  })

  it('skips empty blocks entirely', () => {
    const doc = prose(para('One.'), { type: 'paragraph', content: [] }, para('Two.'))
    expect(docToText(doc)).toBe('One.\n\nTwo.')
  })

  it('flattens a screenplay in reading order', () => {
    const doc: StoryboardDoc = {
      type: 'doc',
      content: [
        { type: 'scene_heading', content: [{ type: 'text', text: 'INT. OFFICE - DAY' }] },
        { type: 'character', content: [{ type: 'text', text: 'RUTH' }] },
        { type: 'dialogue', content: [{ type: 'text', text: 'No.' }] },
      ],
    }
    expect(docToText(doc)).toBe('INT. OFFICE - DAY\n\nRUTH\n\nNo.')
  })
})

describe('countWords', () => {
  it('counts whitespace-separated words', () => {
    expect(countWords('She left the harbour before dawn.')).toBe(6)
  })

  it('is zero for empty and blank text', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('   \n\n  ')).toBe(0)
  })

  it('does not count standalone punctuation as a word', () => {
    expect(countWords('Yes — no')).toBe(2)
    expect(countWords('* * *')).toBe(0)
  })

  it('counts a hyphenated or apostrophised word once', () => {
    expect(countWords("a half-remembered dream she'd had")).toBe(5)
  })

  it('counts words in non-Latin scripts', () => {
    expect(countWords('মেঘ জমেছে')).toBe(2)
  })

  it('treats a line break as a separator', () => {
    expect(countWords('one\ntwo\n\nthree')).toBe(3)
  })
})

describe('hashContent (FR-13.6)', () => {
  it('is a sha256 hex digest', () => {
    expect(hashContent('hello')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is stable for the same text', () => {
    expect(hashContent('the tide')).toBe(hashContent('the tide'))
  })

  it('changes when a single character changes', () => {
    expect(hashContent('the tide')).not.toBe(hashContent('the tide.'))
  })
})

describe('derive', () => {
  it('produces all three columns from one document', () => {
    const doc = prose(para('She left the harbour before dawn.'))
    expect(derive(doc)).toEqual({
      contentText: 'She left the harbour before dawn.',
      wordCount: 6,
      contentHash: hashContent('She left the harbour before dawn.'),
    })
  })

  it('hashes the flattened text, so formatting alone does not change the hash', () => {
    const plain = prose(para('She was certain.'))
    const marked = prose({
      type: 'paragraph',
      content: [
        { type: 'text', text: 'She was ' },
        { type: 'text', text: 'certain', marks: [{ type: 'em' }] },
        { type: 'text', text: '.' },
      ],
    })
    expect(derive(plain).contentHash).toBe(derive(marked).contentHash)
  })
})
