/**
 * What the marketing home shows (FR-1.1).
 *
 * Every string here is copied from the seed library — the same request, the
 * same accepted suggestion — so a visitor who clicks through lands on the
 * storyboard they have just been reading about rather than on something that
 * merely resembles it. If `packages/db/prisma/seed/storyboards/library.ts`
 * changes, this changes.
 *
 * Three examples rather than one, and chosen for three different *kinds of
 * stuck* rather than three different books: a joke that will not land, an
 * atmosphere that will not carry, a symbol that has become too obvious. What a
 * visitor needs to believe is that the product handles their problem, and
 * their problem is a kind, not a title.
 *
 * Slugs are `slugify(title)-publicId`, which is what the seeder builds.
 */

export type Example = {
  id: string
  /** What is wrong, in the words a writer would use about their own draft. */
  label: string
  kind: string
  /** The author's own description of the problem, from the seeded request. */
  said: string
  before: string
  /** The contributor's note to the author, from the accepted suggestion. */
  note: string
  after: string
  source: string
}

export const EXAMPLES: Example[] = [
  {
    id: 'austen',
    label: 'A joke that lands flat',
    kind: 'rewrite this',
    said: 'The first line is the whole book and the second paragraph just explains it, which is the worst thing a second paragraph can do. I want it to widen the joke rather than restate it.',
    before:
      '…this truth is so well fixed in the minds of the surrounding families, that he is considered as the rightful property of some one or other of their daughters.',
    note: 'Kept the aphorism and let the village be the one drawing the conclusion, so the joke lands on them rather than on the reader.',
    after:
      '…and the gentleman himself, arriving with no opinion on the matter, finds one waiting for him at the gate, together with a list of the young ladies to whom he is already, in the general understanding of the parish, very nearly engaged.',
    source: 'Pride and Prejudice · Jane Austen, 1813',
  },
  {
    id: 'conrad',
    label: 'An atmosphere',
    kind: 'rewrite this',
    said: 'This is the Thames and the whole book is about a different river. I want the description to carry that without any foreshadowing a reader could point at.',
    before:
      '…the tanned sails of the barges drifting up with the tide seemed to stand still in red clusters of canvas sharply peaked, with gleams of varnished sprits.',
    note: 'Kept every image and changed only the verbs, so the stillness reads as waiting rather than peace.',
    after:
      '…the tanned sails of the barges drifting up with the tide hung motionless, red clusters of canvas sharply peaked, with gleams of varnished sprits — going somewhere, all of them, and none of them appearing to move at all.',
    source: 'Heart of Darkness · Joseph Conrad, 1899',
  },
  {
    id: 'chopin',
    label: 'A symbol too heavy',
    kind: 'rewrite this',
    said: 'A creature in a cage saying go away all day, in a language nobody bothers to understand. I want that to sit slightly wrong with the reader without becoming a symbol they can name. Lighter, not heavier.',
    before:
      'He could speak a little Spanish, and also a language which nobody understood, unless it was the mocking-bird that hung on the other side of the door.',
    note: 'Took out the translation and let the phrase stay foreign, so the reader is also someone the bird is talking past.',
    after:
      '…unless it was the mocking-bird that hung on the other side of the door, whistling his fluty notes out upon the breeze with maddening persistence. Nobody in the house had troubled to learn what either of them was saying.',
    source: 'The Awakening · Kate Chopin, 1899',
  },
]

/** FR-1.1 — two real storyboards, readable with no account. */
export const EXAMPLE_STORYBOARDS = [
  {
    slug: 'the-yellow-wallpaper-seedyellow1',
    title: 'The Yellow Wallpaper',
    blurb:
      'A woman is prescribed rest in a room she cannot leave, and begins to read the pattern on its walls.',
  },
  {
    slug: 'frankenstein-seedfrank01',
    title: 'Frankenstein',
    blurb:
      'A letter home from a ship going north, from a man who has not yet met the thing he will spend his life chasing.',
  },
] as const

/** The seven sections, in the order they are read. Drives the contents rail. */
export const SECTIONS = [
  { id: 'what', title: 'What it is' },
  { id: 'how', title: 'How you use it' },
  { id: 'who', title: 'Who it is for' },
  { id: 'worth', title: 'What it is worth' },
  { id: 'credit', title: 'About credit' },
  { id: 'inout', title: 'In and out' },
  { id: 'honest', title: 'The honest part' },
] as const
