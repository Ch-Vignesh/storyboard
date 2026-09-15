/**
 * What the marketing home shows (FR-1.1).
 *
 * Every string here is copied from the seed library — the same request, the
 * same accepted suggestion, the same contributor — so that a visitor who clicks
 * through lands on the storyboard they have just been reading about rather than
 * on something that merely resembles it. If the seed changes, this changes.
 *
 * The slugs are `slugify(title)-publicId`, which is what
 * `packages/db/prisma/seed/storyboards/seed-library.ts` builds.
 */

export const EXAMPLE = {
  source: 'Pride and Prejudice, Jane Austen, 1813',
  ask: 'The first line is the whole book and the second paragraph just explains it, which is the worst thing a second paragraph can do. I want it to widen the joke rather than restate it — to put the neighbourhood in the room.',
  before:
    'However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered as the rightful property of some one or other of their daughters.',
  note: 'Kept the aphorism and let the village be the one drawing the conclusion, so the joke lands on them rather than on the reader.',
  after:
    'However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families that he is considered the rightful property of some one or other of their daughters; and the gentleman himself, arriving with no opinion on the matter, finds one waiting for him at the gate, together with a list of the young ladies to whom he is already, in the general understanding of the parish, very nearly engaged.',
  contributor: 'an example contributor',
} as const

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
