import { describe, expect, it } from 'vitest'

import { ownShareOf, ownShareSentence } from './own-share'

/** Phase 14, item 6.17 — how much of the main draft the author wrote themselves. */
describe('ownShareOf', () => {
  const authors = new Set(['owner', 'coauthor'])

  it('counts an owner’s and a co-author’s words as the author’s own', () => {
    const share = ownShareOf(
      [
        { wordCount: 600, authorId: 'owner' },
        { wordCount: 200, authorId: 'coauthor' },
        { wordCount: 200, authorId: 'helper' },
      ],
      authors,
    )
    expect(share).toBe(80)
    expect(ownShareSentence(share)).toBe('80% of the main draft is the author’s own words')
  })

  it('rounds, and treats an erased writer’s words as somebody else’s', () => {
    expect(
      ownShareOf(
        [
          { wordCount: 2, authorId: 'owner' },
          { wordCount: 1, authorId: null },
        ],
        authors,
      ),
    ).toBe(67)
  })

  it('says nothing for a story with no words yet', () => {
    expect(ownShareOf([], authors)).toBeNull()
    expect(ownShareOf([{ wordCount: 0, authorId: 'owner' }], authors)).toBeNull()
    expect(ownShareSentence(null)).toBeNull()
    expect(ownShareSentence(undefined)).toBeNull()
  })
})
