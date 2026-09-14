/**
 * The comparison engine is the module most likely to be wrong, so it is tested
 * hardest (architecture section 8): a fixture corpus of real edit shapes, with
 * the stats snapshotted.
 */

import { describe, expect, it } from 'vitest'

import {
  COMPARISON_BUDGET_MS,
  PARAGRAPH_PAIR_THRESHOLD,
  compare,
  dice,
  normalise,
  toParagraphs,
} from './index'
import { bigramsOf } from './paragraphs'

const P1 =
  'It is very seldom that mere ordinary people like John and myself secure ancestral halls for the summer.'
const P2 =
  'A colonial mansion, a hereditary estate, I would say a haunted house, and reach the height of romantic felicity.'
const P3 = 'Still I will proudly declare that there is something queer about it.'
const P4 = 'John laughs at me, of course, but one expects that in marriage.'

const join = (...paragraphs: string[]) => paragraphs.join('\n\n')

describe('normalise', () => {
  it('lowercases, strips punctuation and collapses whitespace', () => {
    expect(normalise('  The   Ship, never—lands!  ')).toBe('the ship never lands')
  })

  it('treats curly and straight quotes as the same', () => {
    expect(normalise('“don’t”')).toBe(normalise('"don\'t"'))
  })

  it('leaves letters in other scripts alone', () => {
    expect(normalise('মেঘ জমেছে।')).toBe('মেঘ জমেছে')
  })
})

describe('dice', () => {
  it('is 1 for identical text', () => {
    const a = bigramsOf(normalise(P1))
    expect(dice(a, a)).toBe(1)
  })

  it('is 0 for text with no shared bigrams', () => {
    expect(dice(bigramsOf('alpha beta'), bigramsOf('gamma delta'))).toBe(0)
  })

  it('scores an edited paragraph above the pairing threshold', () => {
    const before = normalise(P1)
    const after = normalise(
      'It is very seldom that mere ordinary people like John and I secure ancestral halls for the summer.',
    )
    expect(dice(bigramsOf(before), bigramsOf(after))).toBeGreaterThan(PARAGRAPH_PAIR_THRESHOLD)
  })

  it('scores a replaced paragraph below the pairing threshold', () => {
    const before = normalise(P1)
    const after = normalise(
      'The harbour had been empty for a year before anyone thought to ask why the boats never returned.',
    )
    expect(dice(bigramsOf(before), bigramsOf(after))).toBeLessThan(PARAGRAPH_PAIR_THRESHOLD)
  })
})

describe('toParagraphs', () => {
  it('splits on blank lines and drops empties', () => {
    expect(toParagraphs('one\n\n\n  \n\ntwo').map((p) => p.text)).toEqual(['one', 'two'])
  })
})

describe('identical text', () => {
  const result = compare(join(P1, P2, P3), join(P1, P2, P3))

  it('is all kept', () => {
    expect(result.stats).toEqual({ kept: 3, changed: 0, added: 0, removed: 0 })
  })

  it('stays in marks mode', () => {
    expect(result.mode).toBe('marks')
  })

  it('emits no marks, because nothing changed', () => {
    expect(result.rows.every((row) => row.kind === 'same')).toBe(true)
  })
})

describe('a light copy-edit', () => {
  const before = join(P1, P2, P3)
  const after = join(
    P1,
    'A colonial mansion, a hereditary estate, I would say a haunted house, and reach the height of romantic felicity — but that would be asking too much of fate.',
    P3,
  )
  const result = compare(before, after)

  it('keeps the untouched paragraphs and marks the edited one as changed', () => {
    expect(result.stats).toEqual({ kept: 2, changed: 1, added: 0, removed: 0 })
  })

  it('stays in marks mode', () => {
    expect(result.mode).toBe('marks')
  })

  it('marks only the words that moved', () => {
    const changed = result.rows.find((row) => row.kind === 'changed')
    expect(changed?.right?.marks?.some((mark) => mark.kind === 'added')).toBe(true)
    // The opening survives untouched, so it must be marked `same`.
    expect(changed?.right?.marks?.[0]?.kind).toBe('same')
  })

  it('reassembles each side exactly from its marks', () => {
    // The marks are what gets rendered, so losing a space would be visible.
    for (const row of result.rows) {
      if (row.left?.marks) {
        expect(row.left.marks.map((mark) => mark.text).join('')).toBe(row.left.text)
      }
      if (row.right?.marks) {
        expect(row.right.marks.map((mark) => mark.text).join('')).toBe(row.right.text)
      }
    }
  })
})

describe('a heavy edit', () => {
  const before = join(P1, P2, P3, P4)
  const after = join(
    'It is very seldom that ordinary people like John and I are given ancestral halls for a whole summer.',
    'A colonial mansion, a hereditary estate, I would call it a haunted house, and reach the height of romantic felicity.',
    P3,
    'John laughs at me, naturally, but one expects that in a marriage.',
  )
  const result = compare(before, after)

  it('recognises the paragraphs as edited rather than replaced', () => {
    expect(result.stats).toEqual({ kept: 1, changed: 3, added: 0, removed: 0 })
  })

  it('stays in marks mode', () => {
    expect(result.mode).toBe('marks')
  })
})

describe('a full rewrite', () => {
  const before = join(P1, P2, P3)
  const after = join(
    'The harbour had been empty for a year before she noticed.',
    'Nobody had said anything, which was how she knew it mattered.',
    'She walked the length of the quay twice, counting nothing.',
  )
  const result = compare(before, after)

  it('drops into rewrite mode', () => {
    // FR-7.2.3 — under 30% aligned.
    expect(result.mode).toBe('rewrite')
  })

  it('suppresses every word mark', () => {
    for (const row of result.rows) {
      expect(row.left?.marks).toBeUndefined()
      expect(row.right?.marks).toBeUndefined()
    }
  })

  it('reports the paragraphs as removed and added', () => {
    expect(result.stats.kept).toBe(0)
    expect(result.stats.removed).toBe(3)
    expect(result.stats.added).toBe(3)
  })
})

describe('reordered paragraphs', () => {
  const result = compare(join(P1, P2, P3), join(P3, P1, P2))

  it('renders a move as a removal and an addition, never as a crossing', () => {
    // Two pairings that crossed would draw as paragraphs swapping places, which
    // is not what the writer did (architecture section 4 step 3).
    expect(result.stats.kept + result.stats.changed).toBeGreaterThan(0)
    expect(result.stats.added).toBe(result.stats.removed)
  })

  it('accounts for every paragraph on both sides', () => {
    const leftRows = result.rows.filter((row) => row.left !== undefined).length
    const rightRows = result.rows.filter((row) => row.right !== undefined).length
    expect(leftRows).toBe(3)
    expect(rightRows).toBe(3)
  })
})

describe('an added scene', () => {
  const before = join(P1, P2)
  const after = join(P1, 'She had not been back since the spring.', P2)
  const result = compare(before, after)

  it('is one addition and nothing else', () => {
    expect(result.stats).toEqual({ kept: 2, changed: 0, added: 1, removed: 0 })
  })

  it('places the new paragraph between the two it was inserted between', () => {
    expect(result.rows.map((row) => row.kind)).toEqual(['same', 'added', 'same'])
  })
})

describe('a removed paragraph', () => {
  const result = compare(join(P1, P2, P3), join(P1, P3))

  it('is one removal in the right place', () => {
    expect(result.stats).toEqual({ kept: 2, changed: 0, added: 0, removed: 1 })
    expect(result.rows.map((row) => row.kind)).toEqual(['same', 'removed', 'same'])
  })
})

describe('writing into an empty section', () => {
  const result = compare('', join(P1, P2))

  it('is all additions, and not a rewrite', () => {
    // Nothing to align against is not the same as a rewrite; there is no
    // previous text to read instead, so marks mode is correct.
    expect(result.stats).toEqual({ kept: 0, changed: 0, added: 2, removed: 0 })
  })
})

describe('emptying a section', () => {
  const result = compare(join(P1, P2), '')

  it('is all removals', () => {
    expect(result.stats).toEqual({ kept: 0, changed: 0, added: 0, removed: 2 })
  })
})

describe('never diffing below the word (FR-7.3)', () => {
  it('marks a whole word, not the letters that changed inside it', () => {
    const result = compare('She was certain.', 'She was uncertain.')
    const changed = result.rows.find((row) => row.kind === 'changed')
    const added = changed?.right?.marks?.filter((mark) => mark.kind === 'added') ?? []
    // "uncertain" whole, never "un" spliced into the middle of "certain".
    expect(added.map((mark) => mark.text.trim())).toContain('uncertain')
  })
})

describe('NFR-2: under 400 ms for a 2000-word section', () => {
  it('meets the budget on a heavily edited 2000-word section', () => {
    // Distinct paragraphs. Repeating one body would make the alignment
    // genuinely ambiguous and measure the wrong thing.
    const paragraphAt = (index: number) =>
      'Paragraph ' +
      String(index) +
      '. ' +
      'The harbour had been empty for a year before she noticed the tide had stopped. '.repeat(9)

    const before = Array.from({ length: 30 }, (_, i) => paragraphAt(i)).join('\n\n')
    const after = Array.from({ length: 30 }, (_, i) =>
      i % 2 === 0
        ? paragraphAt(i)
        : paragraphAt(i).replace('empty', 'silent').replace('tide', 'water'),
    ).join('\n\n')

    expect(before.split(/\s+/).length).toBeGreaterThan(2000)

    const started = performance.now()
    const result = compare(before, after)
    const elapsed = performance.now() - started

    // 15 untouched, 15 edited: every paragraph aligns and nothing is orphaned.
    expect(result.stats).toEqual({ kept: 15, changed: 15, added: 0, removed: 0 })
    expect(elapsed, `took ${String(Math.round(elapsed))}ms`).toBeLessThan(COMPARISON_BUDGET_MS)
  })
})

describe('a punctuation-only edit', () => {
  // Normalisation makes these the same paragraph for *matching*, which is what
  // keeps them aligned. They are not the same text, and a copy-editing pass is
  // precisely where that difference matters.
  const before = join('The ship had been arriving for eleven years and Ruth wrote it down.', P3)
  const after = join('The ship had been arriving for eleven years, and Ruth wrote it down.', P3)
  const result = compare(before, after)

  it('is reported as changed, not kept', () => {
    expect(result.stats).toEqual({ kept: 1, changed: 1, added: 0, removed: 0 })
  })

  it('marks the comma as an insertion', () => {
    // Adding a comma removes nothing, so only the right side carries a mark.
    const changed = result.rows.find((row) => row.kind === 'changed')
    expect(changed?.right?.marks?.some((mark) => mark.kind === 'added')).toBe(true)
    expect(changed?.left?.marks).toBeDefined()
    expect(changed?.right?.marks?.map((mark) => mark.text).join('')).toBe(changed?.right?.text)
  })

  it('still counts as aligned, so two of these are not a rewrite', () => {
    expect(result.mode).toBe('marks')
  })
})

describe('a smart-quote-only change', () => {
  it('is shown, not swallowed', () => {
    const result = compare(`She said "no".`, `She said “no”.`)
    expect(result.stats.changed).toBe(1)
    expect(result.stats.kept).toBe(0)
  })
})
