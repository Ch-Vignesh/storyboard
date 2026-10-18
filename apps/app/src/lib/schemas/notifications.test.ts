import { describe, expect, it } from 'vitest'

import { FORMER_MEMBER } from '@/lib/people'

import { NOTIFICATION_TYPES, sentenceFor, type Standing } from './notifications'

/** Phase 14, item 6.9 — how a row reads, given who acted and where. */
describe('sentenceFor', () => {
  it('reads a pass as FR-6.10 words it', () => {
    expect(sentenceFor('SUGGESTION_PASSED', { actor: 'Maya', chapter: 4 })).toBe(
      'Maya went a different way on chapter 4. Your version is still on your profile.',
    )
  })

  it('says something whole for every type, knowing nothing more', () => {
    for (const type of NOTIFICATION_TYPES) {
      const sentence = sentenceFor(type)
      expect(sentence, type).toMatch(/^[A-Z].*\.$/u)
      expect(sentence, type).not.toMatch(/null|undefined|chapter/u)
    }
  })

  it('opens with a capital for someone erased, and keeps a chosen name as it is', () => {
    expect(sentenceFor('SUGGESTION_ACCEPTED', { actor: FORMER_MEMBER, chapter: 2 })).toBe(
      'A former member accepted your writing into the main draft in chapter 2.',
    )
    expect(sentenceFor('COAUTHOR_INVITED', { actor: 'bo' })).toBe(
      'bo asked you to write with them.',
    )
  })

  it('words a reopening by where the reader’s own suggestion stands', () => {
    const standings: Standing[] = ['SUBMITTED', 'DRAFT', 'ACCEPTED', 'PASSED', 'STALE', 'WITHDRAWN']
    const sentences = standings.map((standing) =>
      sentenceFor('REQUEST_REOPENED', { actor: 'Maya', chapter: 3, standing }),
    )
    for (const sentence of sentences) {
      expect(sentence).toMatch(/^Maya opened the passage in chapter 3 for help again\. /u)
    }
    expect(new Set(sentences).size).toBe(standings.length)
    expect(sentenceFor('REQUEST_REOPENED', { actor: 'Maya' })).toBe(
      'Maya opened the passage for help again.',
    )
  })

  it('names who closed a request only when somebody did', () => {
    expect(sentenceFor('REQUEST_CLOSED', { actor: 'Maya', chapter: 1 })).toBe(
      'Maya closed the passage you were answering in chapter 1. Any suggestion you sent stays on your profile.',
    )
    expect(sentenceFor('REQUEST_CLOSED', { chapter: 1 })).toMatch(/^The author closed it, or/u)
  })
})
