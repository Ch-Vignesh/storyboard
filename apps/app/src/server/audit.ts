import 'server-only'

import type { Prisma, PrismaClient } from '@storyboard/db'

import type { AuditEventName } from '@/lib/audit-events'
import { logger } from '@/lib/logger'
import { FORMER_MEMBER, nameOf } from '@/lib/people'
import { AUDIT_LOG } from '@/lib/schemas/constants'

/**
 * Phase 14, item 10.2 (NFR-7) — the socially significant events, stored as
 * well as logged.
 *
 * NFR-7 asked for log lines on the moments somebody will need to reason about
 * when something goes wrong socially, and the host keeps logs for days. These
 * rows are kept for `AUDIT_LOG.retentionDays`, and the admin panel's Events
 * screen reads them by story or by person. Each is written after the work it
 * records has been saved, beside that work's log line, and writing one can
 * never fail the action it records.
 */

type Db = PrismaClient | Prisma.TransactionClient

const log = logger.child({ module: 'audit' })

const DAY_MS = 24 * 60 * 60 * 1000

/** Ids and settled values only: a chip, a category, a decision, a count. Never free text. */
export type AuditDetail = Record<string, string | number | boolean | null | readonly string[]>

export type AuditTargetType =
  'SUGGESTION' | 'STORYBOARD' | 'USER' | 'SECTION' | 'VERSION' | 'IDEA' | 'NAME' | 'FLAG'

export type AuditEventInput = {
  event: AuditEventName
  /** Null when the place did it: the purge. */
  actorId: string | null
  /** Whom it was about. Left out, it is found from a suggestion, an idea, a story or an account. */
  subjectId?: string | null
  /** Left out, it is found from a suggestion, an idea or a story. */
  storyboardId?: string | null
  target?: { type: AuditTargetType; id: string } | null
  detail?: AuditDetail
}

/** The story a target is on and whose it is, for a call site that does not have them to hand. */
async function placeOf(
  db: Db,
  target: NonNullable<AuditEventInput['target']>,
): Promise<{ storyboardId: string | null; subjectId: string | null } | null> {
  switch (target.type) {
    case 'STORYBOARD': {
      const story = await db.storyboard.findUnique({
        where: { id: target.id },
        select: { ownerId: true },
      })
      return { storyboardId: target.id, subjectId: story?.ownerId ?? null }
    }
    case 'SUGGESTION': {
      const suggestion = await db.suggestion.findUnique({
        where: { id: target.id },
        select: { contributorId: true, request: { select: { storyboardId: true } } },
      })
      return suggestion
        ? { storyboardId: suggestion.request.storyboardId, subjectId: suggestion.contributorId }
        : null
    }
    case 'IDEA': {
      const idea = await db.idea.findUnique({
        where: { id: target.id },
        select: { authorId: true, request: { select: { storyboardId: true } } },
      })
      return idea ? { storyboardId: idea.request.storyboardId, subjectId: idea.authorId } : null
    }
    case 'USER':
      return { storyboardId: null, subjectId: target.id }
    // A section or a version: its caller has the story to hand, and nobody
    // else is its subject. A name or a flag is on no story and is nobody's.
    case 'SECTION':
    case 'VERSION':
    case 'NAME':
    case 'FLAG':
      return null
  }
}

/**
 * Stores one event. Call it with the client, never a transaction, once the
 * work is saved. It never throws: by then the person's action has gone
 * through, and an error now would tell them it had not (`after-commit.ts`
 * says the same of notifications). A row that cannot be written is logged,
 * and that is all. A story or a person the caller leaves out is looked up
 * here, inside the same guard, so no call site needs a query of its own that
 * could fail the action.
 */
export async function recordEvent(db: Db, input: AuditEventInput): Promise<void> {
  try {
    const found =
      input.target && (input.storyboardId === undefined || input.subjectId === undefined)
        ? await placeOf(db, input.target)
        : null
    await db.auditEvent.create({
      data: {
        event: input.event,
        actorId: input.actorId,
        subjectId: input.subjectId === undefined ? (found?.subjectId ?? null) : input.subjectId,
        storyboardId:
          input.storyboardId === undefined ? (found?.storyboardId ?? null) : input.storyboardId,
        targetType: input.target?.type ?? null,
        targetId: input.target?.id ?? null,
        detail: input.detail,
      },
    })
  } catch (error) {
    log.error(
      { event: 'audit.not_kept', audited: input.event, error: String(error) },
      'an event could not be stored; what it records stands',
    )
  }
}

/** Rows older than `AUDIT_LOG.retentionDays` go, from the daily prune. */
export async function pruneAuditEvents(
  db: PrismaClient,
  now: Date = new Date(),
): Promise<{ deleted: number }> {
  const before = new Date(now.getTime() - AUDIT_LOG.retentionDays * DAY_MS)
  const { count } = await db.auditEvent.deleteMany({ where: { createdAt: { lt: before } } })
  log.info({ event: 'prune.auditEvents', deleted: count }, 'old stored events dropped')
  return { deleted: count }
}

/** A story by its slug, or by an address with `/s/<slug>` in it. */
export function slugFrom(text: string): string {
  const inAddress = /\/s\/([^/?#\s]+)/u.exec(text)?.[1]
  return (inAddress ?? text).trim().replace(/^\/+|\/+$/gu, '')
}

type PersonRow = {
  id: string
  username: string | null
  displayName: string | null
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED'
}

/** An account as the screen names it: by its username, so it can be found on People. */
function accountName(person: PersonRow | undefined): string {
  if (!person) return FORMER_MEMBER
  return person.username ? `@${person.username}` : nameOf(person)
}

export type AuditFilter = { story?: string; person?: string; cursor?: string }

/**
 * The Events screen: the newest first, a page at a time by cursor, for one
 * story (by its address or slug, deleted or not), one person (by exact
 * username or email address, as People finds them: what they did, and what
 * was done about them), both, or neither. A filter that names nothing is
 * said so, rather than shown as an empty history.
 */
export async function auditEvents(db: Db, filter: AuditFilter) {
  const storyText = filter.story?.trim() ?? ''
  const personText = filter.person?.trim().replace(/^@/u, '') ?? ''

  const story = storyText
    ? await db.storyboard.findUnique({
        where: { slug: slugFrom(storyText) },
        select: { id: true, title: true, slug: true },
      })
    : null
  const person = personText
    ? await db.user.findFirst({
        where: personText.includes('@')
          ? { email: { equals: personText, mode: 'insensitive' } }
          : { username: { equals: personText, mode: 'insensitive' } },
        select: { id: true, username: true, displayName: true, status: true },
      })
    : null
  const unknown = storyText && !story ? 'story' : personText && !person ? 'person' : null
  if (unknown) return { unknown, story: null, person: null, events: [], nextCursor: null }

  const rows = await db.auditEvent.findMany({
    where: {
      ...(story ? { storyboardId: story.id } : {}),
      ...(person ? { OR: [{ actorId: person.id }, { subjectId: person.id }] } : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: AUDIT_LOG.page + 1,
    ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
  })
  const page = rows.slice(0, AUDIT_LOG.page)

  // Names and titles for the page, in two queries.
  const personIds = [
    ...new Set(page.flatMap((row) => [row.actorId, row.subjectId]).filter((id) => id !== null)),
  ]
  const storyIds = [...new Set(page.map((row) => row.storyboardId).filter((id) => id !== null))]
  const [people, stories] = await Promise.all([
    db.user.findMany({
      where: { id: { in: personIds } },
      select: { id: true, username: true, displayName: true, status: true },
    }),
    db.storyboard.findMany({
      where: { id: { in: storyIds } },
      select: { id: true, title: true, slug: true, deletedAt: true },
    }),
  ])
  const peopleById = new Map(people.map((row) => [row.id, row]))
  const storiesById = new Map(stories.map((row) => [row.id, row]))

  return {
    unknown: null,
    story: story ? { title: story.title, slug: story.slug } : null,
    person: person ? { name: accountName(person) } : null,
    events: page.map((row) => {
      const where = row.storyboardId ? storiesById.get(row.storyboardId) : undefined
      return {
        id: row.id,
        event: row.event,
        at: row.createdAt,
        /** Null when the place did it. */
        actor: row.actorId ? accountName(peopleById.get(row.actorId)) : null,
        subject: row.subjectId ? accountName(peopleById.get(row.subjectId)) : null,
        story: row.storyboardId
          ? where
            ? { title: where.title, slug: where.deletedAt ? null : where.slug }
            : { title: null, slug: null }
          : null,
        targetType: row.targetType,
        targetId: row.targetId,
        detail: (row.detail ?? null) as Record<string, unknown> | null,
      }
    }),
    nextCursor: rows.length > AUDIT_LOG.page ? (page.at(-1)?.id ?? null) : null,
  }
}
