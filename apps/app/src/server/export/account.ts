import type { PrismaClient } from '@storyboard/db'
import { fileNameFor, toMarkdown, zipFiles } from '@storyboard/export'

import type { Actor } from '@/lib/authz'
import { visibleStoryboardsWhere } from '@/lib/authz/guard'
import type { StoryboardDoc } from '@/lib/doc/schema'
import { docToText } from '@/lib/doc/text'

import { assembleManuscript } from './manuscript'

type Viewer = NonNullable<Actor>

/** Two-space JSON, dates as ISO strings: something a person can read in an editor. */
function json(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

/**
 * Phase 14, item 3.14 — everything the product holds that is yours, as one
 * zip:
 *
 * - `account.json`: profile, address, genres, preferences, the dates, and
 *   whom you have blocked.
 * - `stories/*.md`: every story you own, the main draft as Markdown through
 *   the same exporter as the download button (FR-14.2), credits included.
 * - `suggestions.json`, `ideas.json`: your own words, with the story and the
 *   request named only where you can still read that story — a story that
 *   went private after you helped is its author's to keep, and your words
 *   are still yours.
 * - `credits.json`, `reports-made.json`.
 *
 * What is not here: other people's words (a reply to your idea, an author's
 * decision note), which are theirs; and the reports made about you, which
 * decision 0018 keeps from everyone.
 */
export async function assembleAccountExport(
  db: PrismaClient,
  actor: Viewer,
  now = new Date(),
): Promise<{ zip: Buffer; fileName: string }> {
  const userId = actor.id
  const [user, genres, notifications, blocks, stories, suggestions, ideas, credits, reports] =
    await Promise.all([
      db.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          email: true,
          username: true,
          displayName: true,
          bio: true,
          createdAt: true,
          onboardedAt: true,
          termsAcceptedAt: true,
          rulesSeenAt: true,
          lastSeenAt: true,
          weeklyDigestSentAt: true,
          showPassedWork: true,
          readingTypeScale: true,
          readingLineHeight: true,
          defaultVisibility: true,
          googleLinkedAt: true,
        },
      }),
      db.userGenre.findMany({
        where: { userId },
        orderBy: { order: 'asc' },
        select: { genre: { select: { name: true } } },
      }),
      db.notificationPreference.findMany({
        where: { userId },
        select: { type: true, email: true },
      }),
      db.userBlock.findMany({
        where: { blockerId: userId },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true, blocked: { select: { username: true } } },
      }),
      db.storyboard.findMany({
        where: { ownerId: userId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true, slug: true, title: true },
      }),
      db.suggestion.findMany({
        where: { contributorId: userId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          state: true,
          note: true,
          contentJson: true,
          createdAt: true,
          submittedAt: true,
          decidedAt: true,
          request: { select: { title: true, kind: true, storyboardId: true } },
        },
      }),
      db.idea.findMany({
        where: { authorId: userId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          body: true,
          markedHelpful: true,
          createdAt: true,
          request: { select: { title: true, storyboardId: true } },
        },
      }),
      db.credit.findMany({
        where: { contributorId: userId },
        orderBy: { createdAt: 'asc' },
        select: { type: true, createdAt: true, sectionLineage: true, storyboardId: true },
      }),
      db.report.findMany({
        where: { reporterId: userId },
        orderBy: { createdAt: 'asc' },
        select: {
          targetType: true,
          targetId: true,
          category: true,
          note: true,
          state: true,
          createdAt: true,
          resolvedAt: true,
        },
      }),
    ])

  // The stories your words sit in, named only where you can still read them.
  const mentioned = new Set<string>([
    ...suggestions.map((suggestion) => suggestion.request.storyboardId),
    ...ideas.map((idea) => idea.request.storyboardId),
    ...credits.map((credit) => credit.storyboardId),
  ])
  const readable =
    mentioned.size === 0
      ? []
      : await db.storyboard.findMany({
          where: { AND: [visibleStoryboardsWhere(actor), { id: { in: [...mentioned] } }] },
          select: { id: true, title: true, slug: true },
        })
  const named = new Map(
    readable.map((story) => [story.id, { title: story.title, slug: story.slug }]),
  )
  const storyOf = (id: string) => named.get(id) ?? null

  const files: Record<string, string> = {
    'account.json': json({
      exportedAt: now,
      profile: {
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        bio: user.bio,
        joined: user.createdAt,
        onboarded: user.onboardedAt,
        termsAccepted: user.termsAcceptedAt,
        rulesRead: user.rulesSeenAt,
        lastSeen: user.lastSeenAt,
        // Item 10.6 — when the weekly digest last went to this address.
        weeklyDigestSent: user.weeklyDigestSentAt,
        googleConnected: user.googleLinkedAt,
      },
      genres: genres.map((pin) => pin.genre.name),
      preferences: {
        showPassedWork: user.showPassedWork,
        readingTypeScale: user.readingTypeScale,
        readingLineHeight: user.readingLineHeight,
        defaultVisibility: user.defaultVisibility,
        // Only the types you changed; absence means the default, which is on.
        emailOff: notifications.filter((pref) => !pref.email).map((pref) => pref.type),
      },
      blocked: blocks.map((block) => ({
        username: block.blocked.username,
        since: block.createdAt,
      })),
    }),
    'suggestions.json': json(
      suggestions.map((suggestion) => {
        const story = storyOf(suggestion.request.storyboardId)
        return {
          id: suggestion.id,
          state: suggestion.state,
          text: docToText(suggestion.contentJson as unknown as StoryboardDoc),
          note: suggestion.note,
          created: suggestion.createdAt,
          sent: suggestion.submittedAt,
          decided: suggestion.decidedAt,
          story,
          request: story
            ? { title: suggestion.request.title, kind: suggestion.request.kind }
            : null,
        }
      }),
    ),
    'ideas.json': json(
      ideas.map((idea) => {
        const story = storyOf(idea.request.storyboardId)
        return {
          id: idea.id,
          text: idea.body,
          markedHelpful: idea.markedHelpful,
          created: idea.createdAt,
          story,
          request: story ? { title: idea.request.title } : null,
        }
      }),
    ),
    'credits.json': json(
      credits.map((credit) => ({
        type: credit.type,
        earned: credit.createdAt,
        section: credit.sectionLineage,
        story: storyOf(credit.storyboardId),
      })),
    ),
    'reports-made.json': json(
      reports.map((report) => ({
        about: report.targetType,
        targetId: report.targetId,
        category: report.category,
        note: report.note,
        state: report.state,
        made: report.createdAt,
        resolved: report.resolvedAt,
      })),
    ),
  }

  // One file per story, named after its title; two stories with one title
  // are told apart by the slug, which is unique.
  const used = new Set<string>()
  for (const story of stories) {
    let name = fileNameFor(story.title, 'md')
    if (used.has(name)) name = name.replace(/\.md$/u, `-${story.slug}.md`)
    used.add(name)
    files[`stories/${name}`] = toMarkdown(await assembleManuscript(db, story.id))
  }

  const day = now.toISOString().slice(0, 10)
  return {
    zip: zipFiles(files, now),
    fileName: `draftboard-${user.username ?? 'account'}-${day}.zip`,
  }
}
