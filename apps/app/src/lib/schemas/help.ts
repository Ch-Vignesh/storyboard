import { z } from 'zod'

import {
  FREE_TEXT_CHARS_PER_WORD,
  IDEA_EDIT_MINUTES,
  IDEA_REPLY_WORDS,
  IDEA_WORDS,
  REQUEST_ASK_WORDS,
  REQUEST_EXTRAS,
  REQUEST_OPEN_DAYS,
  REQUEST_PRE_CONTEXT_WORDS,
  REQUEST_TITLE_MAX_CHARS,
  SUGGESTION_NOTE_MAX_CHARS,
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
  const chars = max * FREE_TEXT_CHARS_PER_WORD
  return z
    .string()
    .trim()
    .max(chars, `Keep it under ${String(chars)} characters.`)
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
    // Phase 14, item 7.1 — how the reader's margin names it, as the prototype does.
    wants: 'Wants it rewritten',
  },
  {
    value: 'CONTINUE',
    label: 'Write what comes next',
    blurb: 'This part does not exist yet. You want someone to write it.',
    returns: 'prose',
    wants: 'Wants someone to write it',
  },
  {
    value: 'UNBLOCK',
    label: 'Help me think',
    blurb: 'You want options, a diagnosis, a direction — not someone else’s prose.',
    returns: 'ideas',
    wants: 'Wants ideas',
  },
] as const

export const requestKindSchema = z.enum(['REWRITE', 'CONTINUE', 'UNBLOCK'])
export type RequestKind = z.infer<typeof requestKindSchema>

/** Kinds that come back as mergeable prose (FR-5.2). */
export const PROSE_KINDS: readonly RequestKind[] = ['REWRITE', 'CONTINUE']

/**
 * FR-11.3 with D-8 (item 6.15) — the day a request closes by itself, counted
 * from when it was opened, or last opened again. Pages and cards print it from
 * the day it opens.
 */
export function closesOn(openedAt: Date): Date {
  return new Date(openedAt.getTime() + REQUEST_OPEN_DAYS * 24 * 60 * 60 * 1000)
}

/**
 * FR-5.8 — the range a request's word bounds may take, said once: the form
 * shows it as a hint, and the refusal says it instead of Zod's own words
 * (phase 14, item 6.12).
 */
export const WORD_BOUNDS_SENTENCE = `Between ${String(SUGGESTION_WORDS.floor)} and ${SUGGESTION_WORDS.ceiling.toLocaleString('en-GB')} words.`

const wordBound = z
  .number(WORD_BOUNDS_SENTENCE)
  .int(WORD_BOUNDS_SENTENCE)
  .min(SUGGESTION_WORDS.floor, WORD_BOUNDS_SENTENCE)
  .max(SUGGESTION_WORDS.ceiling, WORD_BOUNDS_SENTENCE)

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
    toneNotes: z
      .string()
      .trim()
      .max(
        REQUEST_EXTRAS.toneNotesMaxChars,
        `Keep the tone notes under ${String(REQUEST_EXTRAS.toneNotesMaxChars)} characters.`,
      )
      .optional(),
    /** Item 6.2 — who the people are, apart from how it sounds. */
    characterNotes: z
      .string()
      .trim()
      .max(
        REQUEST_EXTRAS.toneNotesMaxChars,
        `Keep the character notes under ${String(REQUEST_EXTRAS.toneNotesMaxChars)} characters.`,
      )
      .optional(),
    constraints: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(
            REQUEST_EXTRAS.constraintMaxChars,
            `Keep each rule under ${String(REQUEST_EXTRAS.constraintMaxChars)} characters.`,
          ),
      )
      .max(
        REQUEST_EXTRAS.constraintsMax,
        `Keep it to ${String(REQUEST_EXTRAS.constraintsMax)} rules or fewer.`,
      )
      .optional(),
    /** FR-5.5 — section lineage ids, rendered inline in order. */
    readingList: z
      .array(z.string().min(1))
      .max(
        REQUEST_EXTRAS.readingListMax,
        `Point to ${String(REQUEST_EXTRAS.readingListMax)} sections or fewer.`,
      )
      .optional(),
    /** FR-5.8 — refused in plain words (item 6.12). */
    minWords: wordBound,
    maxWords: wordBound,
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

/**
 * Phase 14, item 6.1 — what an author may change about a request after
 * opening it: everything but the kind and the section, with the same rules
 * as opening. The story-so-far minimum depends on the kind, which the server
 * knows and this does not, so the router checks it.
 */
const editable = createRequestSchema.shape
export const updateRequestSchema = z
  .object({
    requestId: z.string().min(1),
    title: editable.title,
    ask: editable.ask,
    preContext: editable.preContext,
    toneNotes: editable.toneNotes,
    characterNotes: editable.characterNotes,
    constraints: editable.constraints,
    readingList: editable.readingList,
    minWords: editable.minWords,
    maxWords: editable.maxWords,
  })
  .refine((value) => value.minWords <= value.maxWords, {
    message: 'The smallest number has to be smaller than the largest.',
    path: ['minWords'],
  })
  .refine((value) => countWords(value.preContext ?? '') <= REQUEST_PRE_CONTEXT_WORDS.max, {
    message: `Keep the story so far under ${String(REQUEST_PRE_CONTEXT_WORDS.max)} words.`,
    path: ['preContext'],
  })

/** The story-so-far minimum, in the words the schema uses (item 6.1 checks it by kind). */
export const PRE_CONTEXT_TOO_SHORT = `Write at least ${String(REQUEST_PRE_CONTEXT_WORDS.min)} words of the story so far, so nobody has to read the earlier chapters first.`

/** FR-6.2 — the optional note to the author, shown above the prose. */
export const suggestionNoteSchema = z
  .string()
  .trim()
  .max(
    SUGGESTION_NOTE_MAX_CHARS,
    `Keep the note under ${String(SUGGESTION_NOTE_MAX_CHARS)} characters.`,
  )
  .refine(
    (value) => countWords(value) <= SUGGESTION_NOTE_MAX_WORDS,
    `Keep the note under ${String(SUGGESTION_NOTE_MAX_WORDS)} words.`,
  )
  .optional()

/**
 * FR-6.10 — a fixed set, chosen in one click. There is no free-text field.
 * FR-8.6 offers the same four on a restore (phase 14, item 8.14).
 */
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

/** Item 6.8 (D-7) — a reply to an idea: one to four hundred words. */
export const ideaReplySchema = wordBounded(
  IDEA_REPLY_WORDS.min,
  IDEA_REPLY_WORDS.max,
  'so it says something',
)

/** FR-5.9 — the states a request moves through, with the words the UI uses. */
export const REQUEST_STATE_LABELS = {
  OPEN: 'open for help',
  ANSWERED: 'has answers waiting',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
} as const

/**
 * FR-5.9 with FR-6.9 (phase 14, item 1.8) — whether a "help me think" request
 * takes an idea now. A new idea while it is open or has answers; a reply also
 * once it is resolved, so a thread can finish; nothing once it is closed. The
 * server refuses with the reason, and the request page shows the form only
 * when it would be accepted, with the same reason otherwise.
 */
/**
 * Item 6.8 — the moment before which an idea is too old to change: its writer
 * has `IDEA_EDIT_MINUTES` from posting it. The edit writes against this
 * cutoff and the request page offers "Change" by it, so the two agree.
 */
export function ideaChangeCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - IDEA_EDIT_MINUTES * 60 * 1000)
}

export function ideaTakenNow(
  state: keyof typeof REQUEST_STATE_LABELS,
  reply: boolean,
): { ok: true } | { ok: false; reason: string } {
  switch (state) {
    case 'OPEN':
    case 'ANSWERED':
      return { ok: true }
    case 'RESOLVED':
      return reply
        ? { ok: true }
        : {
            ok: false,
            reason:
              'An idea here has already helped, so this request takes no new ideas. You can still reply to one.',
          }
    case 'CLOSED':
      return { ok: false, reason: 'This request is closed, so it takes no more ideas.' }
  }
}

/** FR-6.4 */
export const SUGGESTION_STATE_LABELS = {
  DRAFT: 'draft',
  SUBMITTED: 'waiting on the author',
  ACCEPTED: 'accepted',
  PASSED: 'not used',
  STALE: 'needs updating',
  WITHDRAWN: 'withdrawn',
} as const

/**
 * FR-5.10 — a request closed without accepting leaves what was waiting on it
 * "marked as not accepted". Marked, not changed: the rows stay as they were,
 * so reopening the request (FR-5.9) puts them back in front of the author.
 * Until the 2026-10-16 spec review they read "waiting on the author" for
 * good, and held their writers' place in the per-story quota.
 */
export function waitsOnClosedRequest(state: string, requestState: string): boolean {
  return requestState === 'CLOSED' && (state === 'SUBMITTED' || state === 'STALE')
}

export function suggestionStateLabel(
  state: keyof typeof SUGGESTION_STATE_LABELS,
  requestState: string,
): string {
  return waitsOnClosedRequest(state, requestState) ? 'not accepted' : SUGGESTION_STATE_LABELS[state]
}

/** Decision 0046 (phase 14, item 2.9; D-9) — what a blocked person is told where they would have helped, by the screen and by the server alike. */
export const BLOCKED_FROM_HELPING =
  "This author isn't taking suggestions from you. You can still read the story."
