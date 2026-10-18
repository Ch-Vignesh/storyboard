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
  // Hidden after a report (item 2.7, decision 0045): no longer an answer.
  hiddenAt: null,
} satisfies Prisma.SuggestionWhereInput

/*
 * FR-5.9 with FR-6.9 (phase 14, item 1.12) — what answers a "help me think"
 * request: a top-level idea from somebody who is not one of the story's
 * authors. A reply is conversation, and an author's own idea is thinking
 * aloud; neither moves the request or takes it out of the quiet nudge. Until
 * phase 14 every idea counted, so one reply from the author dropped the
 * request out of the nudge, and no idea ever moved a request at all.
 *
 * Across many requests the authors differ per row, which a relation filter
 * cannot express, so the lists count in code with `withIdeaAnswers`; within
 * one request `ideaAnswerWhere` says the same thing to the database. The
 * request's state carries the answer too: OPEN means none yet.
 */

export type IdeaLike = { authorId: string; parentId: string | null; hiddenAt?: Date | null }
export type AuthorsLike = { ownerId: string; coauthorIds: readonly string[] }

export function isIdeaAnswer(idea: IdeaLike, authors: AuthorsLike): boolean {
  return (
    (idea.hiddenAt ?? null) === null &&
    idea.parentId === null &&
    idea.authorId !== authors.ownerId &&
    !authors.coauthorIds.includes(idea.authorId)
  )
}

export function countIdeaAnswers(ideas: readonly IdeaLike[], authors: AuthorsLike): number {
  return ideas.filter((idea) => isIdeaAnswer(idea, authors)).length
}

export function ideaAnswerWhere(authors: AuthorsLike): Prisma.IdeaWhereInput {
  return {
    parentId: null,
    hiddenAt: null,
    authorId: { notIn: [authors.ownerId, ...authors.coauthorIds] },
  }
}

/** The authors of a story, as a select, for counting idea answers across requests. */
export const AUTHORS_SELECT = {
  ownerId: true,
  collaborators: { where: { acceptedAt: { not: null } }, select: { userId: true } },
} satisfies Prisma.StoryboardSelect

type AuthorsRow = { ownerId: string; collaborators: ReadonlyArray<{ userId: string }> }

export function authorsOf(story: AuthorsRow): AuthorsLike {
  return { ownerId: story.ownerId, coauthorIds: story.collaborators.map((c) => c.userId) }
}

/** What a list selects of each request's ideas: `TOP_LEVEL_IDEAS` keeps the replies out. */
export const TOP_LEVEL_IDEAS = {
  where: { parentId: null, hiddenAt: null },
  select: { authorId: true },
} satisfies Prisma.ContributionRequest$ideasArgs

/**
 * A request row selected with `AUTHORS_SELECT` on its story and
 * `TOP_LEVEL_IDEAS`, returned with `_count.ideas` as the number of idea
 * answers in place of the raw ideas.
 */
export function withIdeaAnswers<
  T extends {
    ideas: ReadonlyArray<{ authorId: string }>
    _count: { suggestions: number }
    storyboard: AuthorsRow
  },
>(row: T): Omit<T, 'ideas' | '_count'> & { _count: { suggestions: number; ideas: number } } {
  const { ideas, _count, ...rest } = row
  const authors = authorsOf(row.storyboard)
  return {
    ...rest,
    _count: {
      suggestions: _count.suggestions,
      // Top-level by selection, so only the writer is left to check.
      ideas: ideas.filter((idea) => isIdeaAnswer({ ...idea, parentId: null }, authors)).length,
    },
  }
}
