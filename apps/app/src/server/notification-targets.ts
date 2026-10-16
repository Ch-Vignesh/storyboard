import type { Prisma, PrismaClient } from '@storyboard/db'

import { visibleStoryboardsWhere } from '@/lib/authz/guard'
import type { NotificationType } from '@/lib/schemas/notifications'

/*
 * Where a notification leads, and what it names (FR-12.1, FR-12.3).
 *
 * Worked out when it is read, not when it is written. Most rows store only
 * ids, and both the in-app list and the emails read a link and a title from
 * the payload, so until the 2026-10-16 spec review "your suggestion was
 * accepted" led nowhere and named nothing, and the email about a suggestion
 * arriving pointed at the list, where the row had no link either. Resolving
 * at read time mends every row ever written, not only new ones.
 *
 * And it asks the one question a stored title cannot: whether this person may
 * still read the story. A story made private since names nothing and links
 * nowhere; its sentence alone says what happened.
 *
 * No `server-only` guard: the digests import this, and `pnpm cron` runs those
 * in plain Node (see `mail/digests.ts`).
 */

type Db = PrismaClient | Prisma.TransactionClient

export type NotificationRow = {
  id: string
  type: NotificationType
  payload: Prisma.JsonValue
}

/** A path inside the application, and the thing the row is about. Either may be null. */
export type Target = { path: string | null; title: string | null }

const NOWHERE: Target = { path: null, title: null }

function fieldsOf(payload: Prisma.JsonValue): Record<string, unknown> {
  return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}
}

function text(data: Record<string, unknown>, key: string): string | null {
  const value = data[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

export async function targetsFor(
  db: Db,
  userId: string,
  rows: readonly NotificationRow[],
): Promise<Map<string, Target>> {
  const read = rows.map((row) => ({ row, data: fieldsOf(row.payload) }))
  const all = (key: string) => [
    ...new Set(read.map(({ data }) => text(data, key)).filter((id): id is string => id !== null)),
  ]

  const [suggestions, ideas, sections, invitations] = await Promise.all([
    db.suggestion.findMany({
      where: { id: { in: all('suggestionId') } },
      select: { id: true, publicId: true, requestId: true, contributorId: true, state: true },
    }),
    db.idea.findMany({
      where: { id: { in: all('ideaId') } },
      select: { id: true, requestId: true },
    }),
    db.section.findMany({
      where: { id: { in: all('sectionId') } },
      select: { id: true, chapter: { select: { version: { select: { storyboardId: true } } } } },
    }),
    db.collaborator.findMany({
      where: { id: { in: all('invitationId') } },
      select: {
        id: true,
        userId: true,
        acceptedAt: true,
        storyboard: { select: { title: true, deletedAt: true } },
      },
    }),
  ])

  const requestIds = new Set([
    ...all('requestId'),
    ...suggestions.map((suggestion) => suggestion.requestId),
    ...ideas.map((idea) => idea.requestId),
  ])
  const requests = await db.contributionRequest.findMany({
    where: { id: { in: [...requestIds] } },
    select: { id: true, publicId: true, title: true, storyboardId: true },
  })

  // Only the stories this person may read now. One that is not here is
  // private to them, deleted, or never existed, and the row says nothing of it.
  const storyboardIds = new Set([
    ...all('storyboardId'),
    ...requests.map((request) => request.storyboardId),
    ...sections.map((section) => section.chapter.version.storyboardId),
  ])
  const storyboards = await db.storyboard.findMany({
    where: {
      AND: [
        visibleStoryboardsWhere({ id: userId }),
        { OR: [{ id: { in: [...storyboardIds] } }, { slug: { in: all('slug') } }] },
      ],
    },
    select: { id: true, slug: true, title: true },
  })

  const suggestionById = new Map(suggestions.map((suggestion) => [suggestion.id, suggestion]))
  const ideaById = new Map(ideas.map((idea) => [idea.id, idea]))
  const requestById = new Map(requests.map((request) => [request.id, request]))
  const sectionById = new Map(sections.map((section) => [section.id, section]))
  const storyById = new Map(storyboards.map((storyboard) => [storyboard.id, storyboard]))
  const storyBySlug = new Map(storyboards.map((storyboard) => [storyboard.slug, storyboard]))
  const get = <T>(map: Map<string, T>, key: string | null | undefined) =>
    key ? map.get(key) : undefined

  const targets = new Map<string, Target>()
  for (const { row, data } of read) {
    const suggestion = get(suggestionById, text(data, 'suggestionId'))
    const idea = get(ideaById, text(data, 'ideaId'))
    const request = get(
      requestById,
      text(data, 'requestId') ?? suggestion?.requestId ?? idea?.requestId,
    )
    const requestStory = get(storyById, request?.storyboardId)
    const requestPath =
      request && requestStory ? `/s/${requestStory.slug}/help/${request.publicId}` : null

    let target = NOWHERE
    switch (row.type) {
      case 'SUGGESTION_RECEIVED':
      case 'SUGGESTION_ACCEPTED':
      case 'SUGGESTION_PASSED':
      case 'SUGGESTION_STALE': {
        if (!request || !requestPath) break
        // The suggestion itself where this person can open it: an author can
        // open any that was sent, its writer any of their own. One taken back
        // to be updated is a draft again, and only its writer's.
        const opens =
          suggestion && (suggestion.state !== 'DRAFT' || suggestion.contributorId === userId)
        target = {
          path: opens ? `${requestPath}/s/${suggestion.publicId}` : requestPath,
          title: request.title,
        }
        break
      }
      case 'IDEA_RECEIVED':
      case 'IDEA_MARKED_HELPFUL':
      case 'REQUEST_CLOSED':
      case 'REQUEST_REOPENED':
      case 'REQUEST_QUIET_SEVEN_DAYS':
        if (request && requestPath) target = { path: requestPath, title: request.title }
        break
      case 'CONTRIBUTION_REMOVED': {
        const section = get(sectionById, text(data, 'sectionId'))
        const story = get(storyById, section?.chapter.version.storyboardId)
        // The credits page: it shows the credit, standing, and that the
        // writing is no longer in the draft.
        if (story) target = { path: `/s/${story.slug}/contributors`, title: story.title }
        break
      }
      case 'SPIN_OFF_CREATED': {
        // The spin-off, if it can be read; otherwise the original's family
        // tree, which lists it once it is.
        const spinOff = get(storyById, text(data, 'storyboardId'))
        const original = get(storyBySlug, text(data, 'slug'))
        if (spinOff) target = { path: `/s/${spinOff.slug}`, title: spinOff.title }
        else if (original) target = { path: `/s/${original.slug}/lineage`, title: original.title }
        break
      }
      case 'COAUTHOR_INVITED': {
        // An invitation still open names its story, private or not: the owner
        // chose to show it to this person by inviting them. Accepted, it is
        // their story now; taken back or declined, it names nothing.
        const invitation = invitations.find((entry) => entry.id === text(data, 'invitationId'))
        const story = get(storyById, text(data, 'storyboardId'))
        if (invitation?.userId === userId && !invitation.storyboard.deletedAt) {
          target = invitation.acceptedAt
            ? { path: story ? `/s/${story.slug}` : null, title: invitation.storyboard.title }
            : { path: '/invitations', title: invitation.storyboard.title }
        }
        break
      }
      case 'COAUTHOR_ACCEPTED': {
        const story = get(storyById, text(data, 'storyboardId'))
        if (story) target = { path: `/s/${story.slug}/coauthors`, title: story.title }
        break
      }
      case 'WEEKLY_DIGEST':
        break
    }
    targets.set(row.id, target)
  }
  return targets
}
