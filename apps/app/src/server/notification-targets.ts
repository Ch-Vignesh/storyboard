import type { Prisma, PrismaClient } from '@storyboard/db'

import { publicIdOfSlug, visibleStoryboardsWhere } from '@/lib/authz/guard'
import { nameOf } from '@/lib/people'
import { ERASED_RECORD } from '@/server/hidden'
import type { NotificationType, Standing } from '@/lib/schemas/notifications'

/*
 * Where a notification leads, what it names, and who did it (FR-12.1, FR-12.3).
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
 * Phase 14, item 6.9 — the same pass says who acted and which chapter the
 * passage is in, so a row can read as FR-6.10 asks: "Maya went a different
 * way on chapter 4." Nothing of that is stored either. Who acted is read off
 * the thing the row points at (a suggestion's decider, an idea's writer, an
 * invitation's sender), and rows written since carry `byId` where nothing
 * else records it; older rows of those kinds name nobody rather than guess.
 * Someone erased is "a former member", as everywhere else. A name is given
 * only where the story can be read: a private story names nobody, as it
 * names nothing.
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

export type Target = {
  /** A path inside the application. */
  path: string | null
  /** The thing the row is about: a request's title, or a story's. */
  title: string | null
  /** Item 6.9 — who acted, as `nameOf` puts it; null when the row names nobody, or may not. */
  actor: string | null
  /** The position of the chapter the passage is in, counted from 1; null once it is gone. */
  chapter: number | null
  /** REQUEST_REOPENED — where this person's own suggestion on it stands. */
  standing: Standing | null
  /** REQUEST_CLOSED — the nightly close (item 6.15) closed it, not a person. */
  automatic?: boolean
  /** FR-15.3 (phase 14, item 7.7) — the story it leads into is a seeded example. */
  example?: boolean
}

export const NOWHERE: Target = {
  path: null,
  title: null,
  actor: null,
  chapter: null,
  standing: null,
}

function fieldsOf(payload: Prisma.JsonValue): Record<string, unknown> {
  return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}
}

function text(data: Record<string, unknown>, key: string): string | null {
  const value = data[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

type Passage =
  | {
      deletedAt: Date | null
      mergedIntoId: string | null
      chapter: { order: number; deletedAt: Date | null }
    }
  | null
  | undefined

/** The chapter a passage is in, counted from 1, while it is still in the story. */
function chapterOf(section: Passage): number | null {
  if (!section || section.deletedAt || section.mergedIntoId || section.chapter.deletedAt) {
    return null
  }
  return section.chapter.order + 1
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

  const [suggestions, ideas, sections, invitations, revisions] = await Promise.all([
    db.suggestion.findMany({
      where: { id: { in: all('suggestionId') } },
      select: {
        id: true,
        publicId: true,
        requestId: true,
        contributorId: true,
        state: true,
        decidedById: true,
        // Decision 0013 — erased, its writer is named nowhere.
        credits: ERASED_RECORD,
      },
    }),
    // Ideas and the replies under them are one table.
    db.idea.findMany({
      where: { id: { in: [...all('ideaId'), ...all('replyId')] } },
      select: { id: true, requestId: true, authorId: true, credits: ERASED_RECORD },
    }),
    db.section.findMany({
      where: { id: { in: all('sectionId') } },
      select: {
        id: true,
        deletedAt: true,
        mergedIntoId: true,
        chapter: {
          select: { order: true, deletedAt: true, version: { select: { storyboardId: true } } },
        },
      },
    }),
    db.collaborator.findMany({
      where: { id: { in: all('invitationId') } },
      select: {
        id: true,
        userId: true,
        invitedById: true,
        acceptedAt: true,
        storyboard: { select: { title: true, deletedAt: true } },
      },
    }),
    // The revision a restore made; its writer is who restored.
    db.revision.findMany({
      where: { id: { in: all('revisionId') } },
      select: { id: true, authorId: true },
    }),
  ])

  const requestIds = new Set([
    ...all('requestId'),
    ...suggestions.map((suggestion) => suggestion.requestId),
    ...ideas.map((idea) => idea.requestId),
  ])
  const requests = await db.contributionRequest.findMany({
    where: { id: { in: [...requestIds] } },
    select: {
      id: true,
      publicId: true,
      title: true,
      storyboardId: true,
      section: {
        select: {
          deletedAt: true,
          mergedIntoId: true,
          chapter: { select: { order: true, deletedAt: true } },
        },
      },
      // Whose acceptance made the other suggestions stale.
      suggestions: { where: { state: 'ACCEPTED' }, select: { decidedById: true }, take: 1 },
    },
  })

  // Item 6.9 — for "open again", where this person's own suggestion stands:
  // the last one they sent there.
  const reopened = read
    .filter(({ row }) => row.type === 'REQUEST_REOPENED')
    .map(({ data }) => text(data, 'requestId'))
    .filter((id): id is string => id !== null)
  const standings =
    reopened.length > 0
      ? await db.suggestion.findMany({
          where: { requestId: { in: reopened }, contributorId: userId, submittedAt: { not: null } },
          orderBy: { submittedAt: 'desc' },
          select: { requestId: true, state: true },
        })
      : []
  const standingByRequest = new Map<string, Standing>()
  for (const entry of standings) {
    if (!standingByRequest.has(entry.requestId)) standingByRequest.set(entry.requestId, entry.state)
  }

  // Only the stories this person may read now. One that is not here is
  // private to them, deleted, or never existed, and the row says nothing of it.
  const storyboardIds = new Set([
    ...all('storyboardId'),
    ...requests.map((request) => request.storyboardId),
    ...sections.map((section) => section.chapter.version.storyboardId),
  ])
  const payloadPublicIds = all('slug')
    .map(publicIdOfSlug)
    .filter((id): id is string => id !== null)
  const storyboards = await db.storyboard.findMany({
    where: {
      AND: [
        visibleStoryboardsWhere({ id: userId }),
        {
          OR: [
            { id: { in: [...storyboardIds] } },
            { slug: { in: all('slug') } },
            // Item 8.7 — a slug written into a row before the story was
            // retitled still finds it, by the `publicId` it ends with.
            { publicId: { in: payloadPublicIds } },
          ],
        },
      ],
    },
    select: { id: true, slug: true, publicId: true, title: true, ownerId: true },
  })

  // Everyone a row might name, read once. `nameOf` says how, and says "a
  // former member" of an account since deleted.
  const peopleIds = new Set<string>()
  const remember = (id: string | null | undefined) => {
    if (id) peopleIds.add(id)
  }
  for (const suggestion of suggestions) {
    remember(suggestion.contributorId)
    remember(suggestion.decidedById)
  }
  for (const idea of ideas) remember(idea.authorId)
  for (const invitation of invitations) {
    remember(invitation.invitedById)
    remember(invitation.userId)
  }
  for (const revision of revisions) remember(revision.authorId)
  for (const request of requests) remember(request.suggestions[0]?.decidedById)
  for (const storyboard of storyboards) remember(storyboard.ownerId)
  for (const id of all('byId')) remember(id)
  const people =
    peopleIds.size > 0
      ? await db.user.findMany({
          where: { id: { in: [...peopleIds] } },
          select: { id: true, displayName: true, username: true, status: true },
        })
      : []
  const personById = new Map(people.map((person) => [person.id, person]))
  const name = (id: string | null | undefined): string | null => {
    const person = id ? personById.get(id) : undefined
    return person ? nameOf(person) : null
  }
  /** Who wrote a suggestion or an idea, unless they erased its record (decision 0013). */
  const writer = (
    row: { credits: readonly unknown[] } | undefined,
    id: string | undefined,
  ): string | null => (row && row.credits.length > 0 ? null : name(id))

  const suggestionById = new Map(suggestions.map((suggestion) => [suggestion.id, suggestion]))
  const ideaById = new Map(ideas.map((idea) => [idea.id, idea]))
  const requestById = new Map(requests.map((request) => [request.id, request]))
  const sectionById = new Map(sections.map((section) => [section.id, section]))
  const revisionById = new Map(revisions.map((revision) => [revision.id, revision]))
  const storyById = new Map(storyboards.map((storyboard) => [storyboard.id, storyboard]))
  const storyBySlug = new Map(storyboards.map((storyboard) => [storyboard.slug, storyboard]))
  const storyByPublicId = new Map(storyboards.map((story) => [story.publicId, story]))
  // An old slug in a payload answers for the story it ends in (item 8.7).
  for (const slug of all('slug')) {
    const id = publicIdOfSlug(slug)
    const story = id ? storyByPublicId.get(id) : undefined
    if (story && !storyBySlug.has(slug)) storyBySlug.set(slug, story)
  }
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
    const chapter = request && requestStory ? chapterOf(request.section) : null
    // Rows written since item 6.9 say who acted where nothing else records it.
    const by = name(text(data, 'byId'))

    let target = NOWHERE
    switch (row.type) {
      case 'SUGGESTION_RECEIVED':
      case 'SUGGESTION_ACCEPTED':
      case 'SUGGESTION_PASSED':
      case 'SUGGESTION_STALE':
      case 'SUGGESTION_WITHDRAWN': {
        if (!request || !requestPath) break
        // The suggestion itself where this person can open it: an author can
        // open any that was sent, its writer any of their own. One taken back
        // to be updated is a draft again, and only its writer's.
        const opens =
          suggestion && (suggestion.state !== 'DRAFT' || suggestion.contributorId === userId)
        // Its writer when one arrived or was taken back; its decider when it
        // was decided on; whoever accepted another when this one went stale.
        const actor =
          row.type === 'SUGGESTION_RECEIVED' || row.type === 'SUGGESTION_WITHDRAWN'
            ? writer(suggestion, suggestion?.contributorId)
            : row.type === 'SUGGESTION_STALE'
              ? name(request.suggestions[0]?.decidedById)
              : name(suggestion?.decidedById)
        target = {
          ...NOWHERE,
          path: opens ? `${requestPath}/s/${suggestion.publicId}` : requestPath,
          title: request.title,
          actor,
          chapter,
        }
        break
      }
      case 'IDEA_REPLY': {
        // The request, at the thread the reply is in (phase 14, item 1.9).
        const thread = text(data, 'ideaId')
        if (request && requestPath) {
          target = {
            ...NOWHERE,
            path: thread ? `${requestPath}#idea-${thread}` : requestPath,
            title: request.title,
            actor: ((reply) => writer(reply, reply?.authorId))(
              get(ideaById, text(data, 'replyId')),
            ),
            chapter,
          }
        }
        break
      }
      case 'IDEA_RECEIVED':
        if (request && requestPath) {
          target = {
            ...NOWHERE,
            path: requestPath,
            title: request.title,
            actor: writer(idea, idea?.authorId),
            chapter,
          }
        }
        break
      case 'IDEA_MARKED_HELPFUL':
      case 'REQUEST_CLOSED':
      case 'REQUEST_AUTO_CLOSED':
      case 'REQUEST_REOPENED':
      case 'REQUEST_QUIET_SEVEN_DAYS':
        if (request && requestPath) {
          target = {
            ...NOWHERE,
            path: requestPath,
            title: request.title,
            actor: by,
            chapter,
            standing:
              row.type === 'REQUEST_REOPENED' ? (standingByRequest.get(request.id) ?? null) : null,
            automatic: row.type === 'REQUEST_CLOSED' && typeof data.after === 'number',
          }
        }
        break
      case 'CONTRIBUTION_REMOVED': {
        const section = get(sectionById, text(data, 'sectionId'))
        const story = get(storyById, section?.chapter.version.storyboardId)
        // The credits page: it shows the credit, standing, and that the
        // writing is no longer in the draft.
        if (story) {
          target = {
            ...NOWHERE,
            path: `/s/${story.slug}/contributors`,
            title: story.title,
            actor: name(get(revisionById, text(data, 'revisionId'))?.authorId),
            chapter: chapterOf(section),
          }
        }
        break
      }
      case 'SPIN_OFF_PUBLISHED': {
        // Decision 0044 (item 7b.4) — the edition, if the spin-off can be
        // read; otherwise nothing is said of it, as for any private story.
        const spinOff = get(storyById, text(data, 'storyboardId'))
        const number = text(data, 'number')
        if (spinOff) {
          target = {
            ...NOWHERE,
            path: number
              ? `/s/${spinOff.slug}/published/${number}`
              : `/s/${spinOff.slug}/published`,
            title: spinOff.title,
            actor: name(spinOff.ownerId),
          }
        }
        break
      }
      case 'SPIN_OFF_CREATED': {
        // The spin-off, if it can be read; otherwise the original's family
        // tree, which lists it once it is. Its writer is named only with it.
        const spinOff = get(storyById, text(data, 'storyboardId'))
        const original = get(storyBySlug, text(data, 'slug'))
        if (spinOff) {
          target = {
            ...NOWHERE,
            path: `/s/${spinOff.slug}`,
            title: spinOff.title,
            actor: name(spinOff.ownerId),
          }
        } else if (original) {
          target = { ...NOWHERE, path: `/s/${original.slug}/lineage`, title: original.title }
        }
        break
      }
      case 'COAUTHOR_INVITED': {
        // An invitation still open names its story, private or not: the owner
        // chose to show it to this person by inviting them. Accepted, it is
        // their story now; taken back or declined, it names nothing.
        const invitation = invitations.find((entry) => entry.id === text(data, 'invitationId'))
        const story = get(storyById, text(data, 'storyboardId'))
        if (invitation?.userId === userId && !invitation.storyboard.deletedAt) {
          const actor = name(invitation.invitedById)
          target = invitation.acceptedAt
            ? {
                ...NOWHERE,
                path: story ? `/s/${story.slug}` : null,
                title: invitation.storyboard.title,
                actor,
              }
            : { ...NOWHERE, path: '/invitations', title: invitation.storyboard.title, actor }
        }
        break
      }
      case 'COAUTHOR_ACCEPTED': {
        const story = get(storyById, text(data, 'storyboardId'))
        const invitation = invitations.find((entry) => entry.id === text(data, 'invitationId'))
        if (story) {
          target = {
            ...NOWHERE,
            path: `/s/${story.slug}/coauthors`,
            title: story.title,
            actor: by ?? name(invitation?.userId),
          }
        }
        break
      }
      case 'WEEKLY_DIGEST':
        // The requests it spoke of are in Browse, whichever week it was.
        target = { ...NOWHERE, path: '/browse' }
        break
    }
    targets.set(row.id, target)
  }

  // FR-15.3 (phase 14, item 7.7) — a row about a seeded story says so, as
  // every other place that names one does. Decided once, after the rows,
  // from the story each path leads into, rather than in every case above.
  const slugOf = (path: string | null) => /^\/s\/([^/?#]+)/u.exec(path ?? '')?.[1]
  const slugs = [...new Set([...targets.values()].map((target) => slugOf(target.path)))].filter(
    (slug): slug is string => Boolean(slug),
  )
  if (slugs.length > 0) {
    const seeded = new Set(
      (
        await db.storyboard.findMany({
          where: { slug: { in: slugs }, isSeed: true },
          select: { slug: true },
        })
      ).map((row) => row.slug),
    )
    for (const target of targets.values()) {
      const slug = slugOf(target.path)
      if (slug && seeded.has(slug)) target.example = true
    }
  }
  return targets
}
