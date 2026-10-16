import type { Prisma } from '@storyboard/db'

/**
 * FR-5.9, FR-11.3, FR-12.4 — what counts as an answer to a request: a
 * suggestion that was sent and not taken back. A draft is somebody thinking
 * about answering; until the 2026-10-16 spec review every one counted, so a
 * request someone had only opened showed "1 suggestion", left browse's
 * "No answers yet", and was never nudged.
 *
 * Sent once and since taken back to update (a rebased stale suggestion) still
 * counts: it was an answer, and is about to be one again.
 *
 * No `server-only` guard: the digests read it under `pnpm cron`.
 */
export const ANSWERS = {
  submittedAt: { not: null },
  state: { not: 'WITHDRAWN' },
} satisfies Prisma.SuggestionWhereInput
