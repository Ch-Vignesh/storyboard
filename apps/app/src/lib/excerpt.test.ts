import { describe, expect, it } from 'vitest'

import { excerpt } from './excerpt'

describe('excerpt', () => {
  it('leaves short text alone, with its whitespace folded', () => {
    expect(excerpt('  She is meant to\nsound stubborn.  ', 80)).toBe(
      'She is meant to sound stubborn.',
    )
  })

  it('cuts at a word and says it cut', () => {
    expect(excerpt('I know where they end up and I cannot get them off the boat.', 29)).toBe(
      'I know where they end up and…',
    )
    // A cut that lands just after a word keeps the word.
    expect(excerpt('I know where they end up and I cannot get them off the boat.', 30)).toBe(
      'I know where they end up and I…',
    )
  })

  it('drops punctuation left hanging at the cut', () => {
    expect(excerpt('Every opening I write is the ship landing, and the ship', 42)).toBe(
      'Every opening I write is the ship landing…',
    )
  })

  it('cuts inside a word only when there is no space to cut at', () => {
    expect(excerpt('Supercalifragilisticexpialidocious and more', 10)).toBe('Supercalif…')
  })
})
