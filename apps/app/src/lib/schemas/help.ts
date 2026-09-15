import { z } from 'zod'

import {
  IDEA_WORDS,
  REQUEST_ASK_WORDS,
  REQUEST_PRE_CONTEXT_WORDS,
  REQUEST_TITLE_MAX_CHARS,
  SUGGESTION_NOTE_MAX_WORDS,
  SUGGESTION_WORDS,
} from './constants'

/**
 * Contribution requests, suggestions and ideas (FR-5, FR-6). Shared by the
 * forms and the tRPC procedures so a bound cannot drift between them.
 */

/**
 * A single line of text, with no control characters.
 *
 * Used for anything that can end up in an email header. `.trim()` strips the
 * ends of a string but not a newline in the middle of one, and a newline in a
 * Subject is a header separator — see `safeSubject` in the mail templates for
 * what that would allow. Refused here so the writer is told, and stripped there
 * so it cannot matter.
 */
// eslint-disable-next-line no-control-regex -- matching them is the point
export const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/

/** Counts words the way the rest of the product does (`lib/doc/text.ts`). */
export function countWords(text: string): number {
  if (text.trim().length === 0) return 0
  let count = 0
  for (const token of text.split(/\s+/)) {
    if (/[\p{L}\p{N}]/u.test(token)) count += 1
  }
  return count
}

/** A word-bounded block of plain text, with the message the writer should see. */
function wordBounded(min: number, max: number, what: string) {
  return z
    .string()
    .trim()
    .refine((value) => countWords(value) >= min, `Write at least ${String(min)} words ${what}.`)
    .refine((value) => countWords(value) <= max, `Keep it under ${String(max)} words.`)
}

/** FR-5.2 — three kinds, because they need different responses. */
export const REQUEST_KINDS = [
  {
    value: 'REWRITE',
    label: 'Rewrite this',
    blurb: 'There is prose here and it is not working. You want someone to write it again.',
    returns: 'prose',
  },
  {
    value: 'CONTINUE',
    label: 'Write what comes next',
    blurb: 'This part does not exist yet. You want someone to write it.',
    returns: 'prose',
  },
  {
    value: 'UNBLOCK',
    label: 'Help me think',
    blurb: 'You want options, a diagnosis, a direction — not someone else’s prose.',
    returns: 'ideas',
  },
] as const

export const requestKindSchema = z.enum(['REWRITE', 'CONTINUE', 'UNBLOCK'])
export type RequestKind = z.infer<typeof requestKindSchema>

/** Kinds that come back as mergeable prose (FR-5.2). */
export const PROSE_KINDS: readonly RequestKind[] = ['REWRITE', 'CONTINUE']

export const createRequestSchema = z
  .object({
    sectionId: z.string().min(1),
    kind: requestKindSchema,
    /** FR-5.3 */
    title: z
      .string()
      .trim()
      .min(1, 'Give it a short title.')
      .refine((value) => !CONTROL_CHARACTERS.test(value), 'Keep the title to one line.')
      .max(
        REQUEST_TITLE_MAX_CHARS,
        `Keep the title under ${String(REQUEST_TITLE_MAX_CHARS)} characters.`,
      ),
    ask: wordBounded(REQUEST_ASK_WORDS.min, REQUEST_ASK_WORDS.max, 'about what you need'),
    /** FR-5.4 — required for the two prose kinds, meaningless for UNBLOCK. */
    preContext: z.string().trim().optional(),
    /** FR-5.6 */
    toneNotes: z.string().trim().max(2000).optional(),
    constraints: z.array(z.string().trim().min(1).max(200)).max(10).optional(),
    /** FR-5.5 — section lineage ids, rendered inline in order. */
    readingList: z.array(z.string().min(1)).max(20).optional(),
    /** FR-5.8 */
    minWords: z.number().int().min(SUGGESTION_WORDS.floor).max(SUGGESTION_WORDS.ceiling),
    maxWords: z.number().int().min(SUGGESTION_WORDS.floor).max(SUGGESTION_WORDS.ceiling),
  })
  .refine((value) => value.minWords <= value.maxWords, {
    message: 'The smallest number has to be smaller than the largest.',
    path: ['minWords'],
  })
  .refine(
    (value) =>
      !PROSE_KINDS.includes(value.kind) ||
      countWords(value.preContext ?? '') >= REQUEST_PRE_CONTEXT_WORDS.min,
    {
      message: `Write at least ${String(REQUEST_PRE_CONTEXT_WORDS.min)} words of the story so far, so nobody has to read the earlier chapters first.`,
      path: ['preContext'],
    },
  )
  .refine((value) => countWords(value.preContext ?? '') <= REQUEST_PRE_CONTEXT_WORDS.max, {
    message: `Keep the story so far under ${String(REQUEST_PRE_CONTEXT_WORDS.max)} words.`,
    path: ['preContext'],
  })

/** FR-6.2 — the optional note to the author, shown above the prose. */
export const suggestionNoteSchema = z
  .string()
  .trim()
  .refine(
    (value) => countWords(value) <= SUGGESTION_NOTE_MAX_WORDS,
    `Keep the note under ${String(SUGGESTION_NOTE_MAX_WORDS)} words.`,
  )
  .optional()

/** FR-6.10 — a fixed set, chosen in one click. There is no free-text field. */
export const PASS_CHIPS = [
  { value: 'NOT_THE_DIRECTION', label: 'Not the direction I want' },
  { value: 'DOES_NOT_FIT_VOICE', label: 'Does not fit the voice' },
  { value: 'TOO_FAR_FROM_OUTLINE', label: 'Too far from the outline' },
  { value: 'SOLVED_ANOTHER_WAY', label: 'I have solved it another way' },
] as const

export const passChipSchema = z.enum([
  'NOT_THE_DIRECTION',
  'DOES_NOT_FIT_VOICE',
  'TOO_FAR_FROM_OUTLINE',
  'SOLVED_ANOTHER_WAY',
])

/** FR-6.9 — ideas are plain text, 20 to 400 words, threaded one level deep. */
export const ideaBodySchema = wordBounded(IDEA_WORDS.min, IDEA_WORDS.max, 'so it is worth reading')

/** FR-5.9 — the states a request moves through, with the words the UI uses. */
export const REQUEST_STATE_LABELS = {
  OPEN: 'open for help',
  ANSWERED: 'has answers waiting',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
} as const

/** FR-6.4 */
export const SUGGESTION_STATE_LABELS = {
  DRAFT: 'draft',
  SUBMITTED: 'waiting on the author',
  ACCEPTED: 'accepted',
  PASSED: 'not used',
  STALE: 'needs updating',
  WITHDRAWN: 'withdrawn',
} as const
