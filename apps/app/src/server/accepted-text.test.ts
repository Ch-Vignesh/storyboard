import { describe, expect, it } from 'vitest'

import { docToText } from '@/lib/doc/text'

import { acceptedDoc } from './accepted-text'

const paragraph = (text: string) =>
  text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' }
const doc = (...blocks: unknown[]) => ({ type: 'doc', content: blocks })

const OPENING = doc(paragraph('The harbour had been empty for a year.'), paragraph(''))
const NEXT = doc(paragraph(''), paragraph('Then, one morning, the boats came back.'))

describe('acceptedDoc (FR-8.1, decision 0038)', () => {
  // Found by the owner on 2026-10-16: accepting "what comes next" erased the
  // section's opening and left only the continuation.
  it('adds a continuation after the text already there', () => {
    const text = docToText(acceptedDoc('CONTINUE', OPENING, NEXT, 'prose'))
    expect(text).toBe(
      'The harbour had been empty for a year.\n\nThen, one morning, the boats came back.',
    )
  })

  it('drops the blank paragraphs where the two meet, and keeps a scene break', () => {
    const withBreak = doc(
      paragraph('The harbour was empty.'),
      { type: 'scene_break' },
      paragraph(''),
    )
    const result = acceptedDoc('CONTINUE', withBreak, NEXT, 'prose')
    expect(result.content.map((block) => block.type)).toEqual([
      'paragraph',
      'scene_break',
      'paragraph',
    ])
  })

  it('makes a continuation the whole text of a section with no words yet', () => {
    const empty = doc(paragraph(''))
    expect(docToText(acceptedDoc('CONTINUE', empty, NEXT, 'prose'))).toBe(
      'Then, one morning, the boats came back.',
    )
    expect(docToText(acceptedDoc('CONTINUE', null, NEXT, 'prose'))).toBe(
      'Then, one morning, the boats came back.',
    )
  })

  it('lets a rewrite replace the text, as it was written to', () => {
    const rewrite = doc(paragraph('The harbour stood empty all year.'))
    expect(docToText(acceptedDoc('REWRITE', OPENING, rewrite, 'prose'))).toBe(
      'The harbour stood empty all year.',
    )
  })
})
