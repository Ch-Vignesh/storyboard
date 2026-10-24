import { z } from 'zod'

import {
  SOFT_DELETE_GRACE_DAYS,
  STORYBOARD_GENRES,
  TITLE_MAX_CHARS,
  STORY_DETAIL_CHARS,
} from './constants'

/**
 * FR-2.1 — everything required to create a storyboard, and nothing else.
 * Shared by the creation form and `storyboard.create` so the two cannot drift.
 */

/**
 * The `StoryType` enum in the order FR-2.1 lists it, with the labels the UI
 * shows. Kept as a literal tuple so `storyTypeSchema` infers the union rather
 * than widening to `string` — Prisma's generated input types reject `string`,
 * which is exactly the protection we want.
 */
export const STORY_TYPE_VALUES = [
  'NOVEL',
  'NOVELLA',
  'SHORT_STORY',
  'SCREENPLAY',
  'STAGE_PLAY',
  'SERIAL',
  'POETRY',
  'NONFICTION',
  'OTHER',
] as const

export type StoryTypeValue = (typeof STORY_TYPE_VALUES)[number]

export const STORY_TYPE_LABELS: Record<StoryTypeValue, string> = {
  NOVEL: 'Novel',
  NOVELLA: 'Novella',
  SHORT_STORY: 'Short story',
  SCREENPLAY: 'Screenplay',
  STAGE_PLAY: 'Stage play',
  SERIAL: 'Serial',
  POETRY: 'Poetry collection',
  NONFICTION: 'Non-fiction',
  OTHER: 'Other',
}

export const STORY_TYPES = STORY_TYPE_VALUES.map((value) => ({
  value,
  label: STORY_TYPE_LABELS[value],
}))

export const storyTypeSchema = z.enum(STORY_TYPE_VALUES)

export const visibilitySchema = z.enum(['PUBLIC', 'PRIVATE'])

export const titleSchema = z
  .string()
  .trim()
  .min(1, 'Give it a title. You can change it later.')
  .max(TITLE_MAX_CHARS, 'That title is too long.')

/**
 * Phase 14, item 8.10 (FR-2.1) — what the genre picker says, from the bounds:
 * the hint beside it, and the sentence when a form is sent without enough.
 * The create form said "(up to 3)" and stayed disabled without one.
 */
export const GENRE_COPY = {
  hint: `Choose ${String(STORYBOARD_GENRES.min)} to ${String(STORYBOARD_GENRES.max)}`,
  missing:
    STORYBOARD_GENRES.min === 1
      ? 'Choose a genre first: it is how readers looking for this kind of story find it.'
      : `Choose at least ${String(STORYBOARD_GENRES.min)} genres first: they are how readers looking for this kind of story find it.`,
} as const

export const createStoryboardSchema = z.object({
  title: titleSchema,
  type: storyTypeSchema,
  genreIds: z
    .array(z.string().min(1))
    .min(STORYBOARD_GENRES.min, 'Pick at least one genre.')
    .max(STORYBOARD_GENRES.max, `Pick at most ${STORYBOARD_GENRES.max} genres.`)
    .refine((ids) => new Set(ids).size === ids.length, 'Pick each genre once.'),
  visibility: visibilitySchema,
})

export const updateStoryboardSchema = z.object({
  storyboardId: z.string().min(1),
  title: titleSchema.optional(),
  logline: z
    .string()
    .trim()
    .max(
      STORY_DETAIL_CHARS.logline,
      `Keep the logline under ${String(STORY_DETAIL_CHARS.logline)} characters.`,
    )
    .nullish(),
  /** FR-14.5 — free text, displayed as written, never verified. */
  rightsNote: z
    .string()
    .trim()
    .max(
      STORY_DETAIL_CHARS.rightsNote,
      `Keep the rights note under ${String(STORY_DETAIL_CHARS.rightsNote)} characters.`,
    )
    .nullish(),
  genreIds: createStoryboardSchema.shape.genreIds.optional(),
  /** Item 8.4 (FR-2.1, D-16) — within its family only; `storyboard.update` refuses a change across. */
  type: storyTypeSchema.optional(),
})

/**
 * Phase 14, item 8.4 (D-16) — why a story's type stays in its family, in the
 * words the server's refusal and the settings form share. The family is the
 * document flavour (`flavourForStoryType`): within one, every section is
 * written in the same blocks and only the label changes; across, every block
 * would have to be rewritten as the other kind.
 */
export const TYPE_FAMILY_COPY = {
  prose:
    'This story is prose, so it can become another kind of prose but not a script: every paragraph would have to be rewritten as scene headings, action and dialogue. To write it as a script, start a new story.',
  screenplay:
    'This story is a script, so it can become a screenplay or a stage play but not prose: its scene headings, characters and dialogue would all become plain paragraphs. To write it as prose, start a new story.',
} as const

/**
 * FR-13.6, quoted rather than paraphrased. This is the product being honest
 * about what it cannot do, and it is required wording on the visibility
 * selector at creation time — so it lives here, beside the schema, not inline
 * in a component where a redesign could lose it.
 */
export const VISIBILITY_COPY = {
  public: {
    label: 'Public',
    summary: 'Anyone can read it, and anyone can offer help.',
  },
  private: {
    label: 'Private',
    summary: 'Only you and the people you invite can read it.',
  },
  /** The honest warning. Shown whenever public is the selected option. */
  copyingRisk:
    'Anyone can read a public story, and anyone can copy what they read. Timestamps prove you wrote it first. If that is not enough for this manuscript, keep it private and invite people you know.',
} as const

/** FR-2.6 — the confirmation names the affected contributors before deleting. */
export const DELETE_COPY = {
  grace: `It stays recoverable for ${SOFT_DELETE_GRACE_DAYS} days, then it is gone for good.`,
} as const
