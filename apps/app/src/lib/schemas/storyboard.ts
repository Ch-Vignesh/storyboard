import { z } from 'zod'

import { SOFT_DELETE_GRACE_DAYS, STORYBOARD_GENRES } from './constants'

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
  .max(200, 'That title is too long.')

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
  logline: z.string().trim().max(300, 'Keep the logline under 300 characters.').nullish(),
  /** FR-14.5 — free text, displayed as written, never verified. */
  rightsNote: z.string().trim().max(500, 'Keep the rights note under 500 characters.').nullish(),
  genreIds: createStoryboardSchema.shape.genreIds.optional(),
})

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
    'Anyone can read a public storyboard, and anyone can copy what they read. Timestamps prove you wrote it first. If that is not enough for this manuscript, keep it private and invite people you know.',
} as const

/** FR-2.6 — the confirmation names the affected contributors before deleting. */
export const DELETE_COPY = {
  grace: `It stays recoverable for ${SOFT_DELETE_GRACE_DAYS} days, then it is gone for good.`,
} as const
