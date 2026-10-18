import type { Prisma, PrismaClient, ReportCategory } from '@storyboard/db'

import type { Actor } from '@/lib/authz'

type Db = PrismaClient | Prisma.TransactionClient

/**
 * FR-13.5, FR-13.7 (phase 14, item 2.7; decision 0045) — what moderation has
 * hidden. A hidden story is the authz guard's business (`lib/authz`); a hidden
 * suggestion or idea stays in its place and reads as removed to everyone but
 * its writer and a moderator, so a thread keeps its shape and a credit line
 * keeps its row. Nothing is deleted.
 *
 * `hidden` says the thing is hidden; `redacted` says this reader is seeing the
 * placeholder rather than the words. The writer and a moderator get
 * `hidden: true, redacted: false`.
 */

/** What a hidden suggestion or idea says in place of its text. */
export const HIDDEN_TEXT = 'Removed after a report.'

/** The same, as a document, for the places that render a suggestion's structured text. */
export const HIDDEN_DOC = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: HIDDEN_TEXT }] }],
} as const

/** Who still sees a hidden thing as it was: its writer, and a moderator. */
export function seesHidden(actor: Actor, writerId: string): boolean {
  return actor?.id === writerId || actor?.moderator === true
}

type Flags = { hidden: boolean; redacted: boolean }

export function redactIdea<
  T extends { hiddenAt: Date | null; body: string; author: { id: string } },
>(idea: T, actor: Actor): T & Flags {
  const hidden = idea.hiddenAt !== null
  if (!hidden || seesHidden(actor, idea.author.id)) return { ...idea, hidden, redacted: false }
  return { ...idea, hidden, redacted: true, body: HIDDEN_TEXT }
}

/** A suggestion in a list: the note is the only text it carries. */
export function redactSuggestionLine<
  T extends { hiddenAt: Date | null; note: string | null; contributor: { id: string } },
>(suggestion: T, actor: Actor): T & Flags {
  const hidden = suggestion.hiddenAt !== null
  if (!hidden || seesHidden(actor, suggestion.contributor.id)) {
    return { ...suggestion, hidden, redacted: false }
  }
  return { ...suggestion, hidden, redacted: true, note: null }
}

/** A suggestion on its own page: note, text and document. */
export function redactSuggestionText<
  T extends {
    hiddenAt: Date | null
    note: string | null
    contentText: string
    contentJson: unknown
    contributor: { id: string }
  },
>(suggestion: T, actor: Actor): T & Flags {
  const hidden = suggestion.hiddenAt !== null
  if (!hidden || seesHidden(actor, suggestion.contributor.id)) {
    return { ...suggestion, hidden, redacted: false }
  }
  return {
    ...suggestion,
    hidden,
    redacted: true,
    note: null,
    contentText: HIDDEN_TEXT,
    contentJson: HIDDEN_DOC,
  }
}

export type HiddenTarget = { type: 'STORYBOARD' | 'SUGGESTION' | 'IDEA'; id: string }

/**
 * Hides a thing a report was about, or shows it again. True when a row
 * changed; false when nothing is there to change.
 */
export async function setHiddenState(
  db: Db,
  target: HiddenTarget,
  change: { hidden: boolean; byId: string; reason: ReportCategory | null },
): Promise<boolean> {
  const data = change.hidden
    ? { hiddenAt: new Date(), hiddenById: change.byId, hiddenReason: change.reason }
    : { hiddenAt: null, hiddenById: null, hiddenReason: null }
  const where = { id: target.id }
  const result =
    target.type === 'STORYBOARD'
      ? await db.storyboard.updateMany({ where, data })
      : target.type === 'SUGGESTION'
        ? await db.suggestion.updateMany({ where, data })
        : await db.idea.updateMany({ where, data })
  return result.count > 0
}
