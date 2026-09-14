import { z } from 'zod'

import { PINNED_GENRES_MIN } from './constants'

/**
 * FR-1.3 steps 3 and 4. The username schema itself lives in `auth.ts` beside
 * the other credential rules; this file is the two onboarding inputs, shared
 * by the forms and the tRPC procedures so a bound cannot drift between them.
 */

/** FR-1.3 — at least three, ordered as the user ranked them (FR-11.2). */
export const pinGenresSchema = z.object({
  genreIds: z
    .array(z.string().min(1))
    .min(PINNED_GENRES_MIN, `Pick at least ${PINNED_GENRES_MIN} genres.`)
    .max(24, 'That is more genres than exist.')
    .refine((ids) => new Set(ids).size === ids.length, 'Pick each genre once.'),
})

/**
 * Shown on the username step. Not a validation rule — a promise the product
 * has to keep, so the copy lives next to the schema that enforces it.
 */
export const USERNAME_PERMANENCE_WARNING =
  'You cannot change this later. It appears in your credit line on every contribution you make.'
