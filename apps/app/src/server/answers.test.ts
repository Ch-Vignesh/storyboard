import { describe, expect, it } from 'vitest'

import { countIdeaAnswers, ideaAnswerWhere, isIdeaAnswer } from './answers'

/**
 * FR-5.9 with FR-6.9 (phase 14, item 1.12) — what answers a "help me think"
 * request: a top-level idea from somebody who is not one of the story's
 * authors. A reply is conversation, and an author's own idea is thinking
 * aloud; neither moves the request or takes it out of the quiet nudge.
 */
const authors = { ownerId: 'owner', coauthorIds: ['co'] }

describe('an idea answer (FR-5.9, FR-6.9)', () => {
  it('is a top-level idea from outside the story', () => {
    expect(isIdeaAnswer({ authorId: 'helper', parentId: null }, authors)).toBe(true)
    // A reply, even from outside.
    expect(isIdeaAnswer({ authorId: 'helper', parentId: 'idea_1' }, authors)).toBe(false)
    // The authors' own.
    expect(isIdeaAnswer({ authorId: 'owner', parentId: null }, authors)).toBe(false)
    expect(isIdeaAnswer({ authorId: 'co', parentId: null }, authors)).toBe(false)
  })

  it('counts them, and the query says the same thing', () => {
    const ideas = [
      { authorId: 'helper', parentId: null },
      { authorId: 'helper', parentId: 'idea_1' },
      { authorId: 'owner', parentId: null },
      { authorId: 'co', parentId: null },
      { authorId: 'another', parentId: null },
      // Hidden after a report (item 2.7): no longer an answer.
      { authorId: 'third', parentId: null, hiddenAt: new Date('2026-10-18T00:00:00Z') },
      // Removed by its writer (item 6.8): no longer an answer either; it was
      // counted until the 2026-10-24 final pass found it.
      { authorId: 'fourth', parentId: null, deletedAt: new Date('2026-10-18T00:00:00Z') },
    ]
    expect(countIdeaAnswers(ideas, authors)).toBe(2)
    expect(ideaAnswerWhere(authors)).toEqual({
      parentId: null,
      hiddenAt: null,
      deletedAt: null,
      authorId: { notIn: ['owner', 'co'] },
    })
  })
})
