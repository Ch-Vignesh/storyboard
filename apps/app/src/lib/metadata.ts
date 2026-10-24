import 'server-only'

import { TRPCError } from '@trpc/server'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { flavourForStoryType, safeParseDoc } from '@/lib/doc/schema'
import { docToText } from '@/lib/doc/text'
import { nameOf } from '@/lib/people'
import { PREVIEW_DESCRIPTION_CHARS } from '@/lib/schemas/constants'
import type { createCaller } from '@/server/trpc/routers/_app'

/**
 * Phase 14, item 9.6 — what a page says about itself to a search engine and
 * to a link preview: its title, a description, a canonical address, and
 * whether it may be indexed at all.
 *
 * **Every word of it comes through the API the page reads with**, called as
 * the person asking (`caller` from `@/trpc/server`, handed in so a test can
 * hand in another). Metadata is rendered before the page and goes places the
 * page does not: a chat app's preview, a search result, a browser tab. So it
 * is built from what `lib/authz` has already let this person read, and from
 * nothing else. A private or hidden story is a 404 here exactly as it is on
 * the page, and a description is written only for a story anyone may read.
 */

/** Any tRPC caller: the request's own on a page, a chosen person's in a test. */
export type Api = ReturnType<typeof createCaller>

/** What the application calls itself wherever it is not on a page. */
export const SITE = {
  name: 'Draftboard',
  description:
    'Post the passage you are stuck on. Other writers propose prose. You accept one, with permanent credit.',
  /** The marketing page's headline; the default link preview says it too. */
  line: 'Stuck on chapter four? Ask a writer.',
} as const

/** Item 9.8 — a page for reading in passing, never for a search result. */
export const NOT_INDEXED = { index: false } as const

/** A page only some people can open: kept out of the index, and its links unfollowed. */
const PRIVATE = { index: false, follow: false } as const

/**
 * A description cut from running text: whitespace folded, at most
 * `PREVIEW_DESCRIPTION_CHARS`, cut at a word with an ellipsis when it is cut.
 */
export function excerpt(text: string, max: number = PREVIEW_DESCRIPTION_CHARS): string {
  const flat = text.replace(/\s+/gu, ' ').trim()
  if (flat.length <= max) return flat
  // Room for the ellipsis, then back to the last whole word, unless that
  // would throw away more than half (one very long word is still a preview).
  const cut = flat.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  const words = space > max / 2 ? cut.slice(0, space) : cut
  return `${words.replace(/[\s,;:.–—-]+$/u, '')}…`
}

/**
 * A page's metadata, or the 404 the page itself would give. A NOT_FOUND from
 * the API is a story, request or suggestion this person may not read, or one
 * that is not there; the two answer alike (NFR-6).
 */
export async function orNotFound(metadata: Promise<Metadata>): Promise<Metadata> {
  try {
    return await metadata
  } catch (error) {
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound()
    throw error
  }
}

type Story = { visibility: 'PUBLIC' | 'PRIVATE'; hiddenAt: Date | null }

/** Public and not hidden after a report: what a stranger may read, and so may be described. */
function readableByAnyone(story: Story): boolean {
  return story.visibility === 'PUBLIC' && story.hiddenAt === null
}

/** A URL segment as a 0-based index; anything else is no position at all. */
function position(segment: string | undefined): number | null {
  if (segment === undefined || !/^[1-9]\d{0,5}$/u.test(segment)) return null
  return Number(segment) - 1
}

type ReaderData = Awaited<ReturnType<Api['storyboard']['get']>>
type ReaderSection = ReaderData['chapters'][number]['sections'][number]

/** A section's current text as a description, read through `section.get` (and its check). */
async function sectionText(
  api: Api,
  storyType: string,
  section: ReaderSection | undefined,
): Promise<string | null> {
  if (!section || section.wordCount === 0) return null
  try {
    const { section: read } = await api.section.get({ sectionId: section.id })
    const parsed = safeParseDoc(read.currentRevision?.contentJson, flavourForStoryType(storyType))
    if (!parsed.success) return null
    const text = excerpt(docToText(parsed.data))
    return text.length > 0 ? text : null
  } catch {
    // A preview is not worth failing a page over: say less instead.
    return null
  }
}

/** The first section with words in it, in reading order. */
function opening(chapters: ReaderData['chapters']): ReaderSection | undefined {
  for (const chapter of chapters) {
    const section = chapter.sections.find((candidate) => candidate.wordCount > 0)
    if (section) return section
  }
  return undefined
}

/**
 * The reader, at a story's address, a chapter's or a section's (SRS section
 * 4), in the main draft or an alternate version (`?version=`).
 *
 * - Title: the story's, and the chapter's before it at a chapter's address.
 * - Description, for a story anyone may read: at the story's address its
 *   logline, or else the first words of its opening; at a chapter's, the
 *   chapter's opening, and at a section's, that section, either falling back
 *   to the logline. Nothing for a private or hidden story: whoever can open
 *   one already knows what it says, and a description is what travels.
 * - Canonical: the story's or the chapter's address in the main draft. A
 *   section's address is its chapter, scrolled; the chapter is the page.
 * - Not indexed: a private or hidden story, nor followed; an alternate version.
 *
 * `chapter` and `section` are the URL's segments as they came. One that names
 * nothing falls back to the story; the page itself answers 404 for it.
 */
export async function storyMetadata(
  api: Api,
  input: { slug: string; versionId?: string; chapter?: string; section?: string },
): Promise<Metadata> {
  const data = await api.storyboard.get({ slug: input.slug, versionId: input.versionId })
  const { storyboard, version } = data

  const chapterIndex = position(input.chapter)
  const chapter = chapterIndex === null ? undefined : data.chapters[chapterIndex]
  const sectionIndex = position(input.section)
  const section = chapter && sectionIndex !== null ? chapter.sections[sectionIndex] : undefined

  const title = chapter ? `${chapter.title} — ${storyboard.title}` : storyboard.title
  if (!readableByAnyone(storyboard)) return { title, robots: PRIVATE }

  const logline = storyboard.logline?.trim() ? excerpt(storyboard.logline) : null
  const description = !chapter
    ? (logline ?? (await sectionText(api, storyboard.type, opening(data.chapters))))
    : ((await sectionText(
        api,
        storyboard.type,
        section ?? chapter.sections.find((candidate) => candidate.wordCount > 0),
      )) ?? logline)

  const path =
    chapter && chapterIndex !== null
      ? `/s/${storyboard.slug}/c/${String(chapterIndex + 1)}`
      : `/s/${storyboard.slug}`

  return {
    title,
    ...(description ? { description } : {}),
    ...(version.isMain ? { alternates: { canonical: path } } : { robots: NOT_INDEXED }),
  }
}

/**
 * Decision 0044 (phase 14, item 7b.2) — a published edition: named for its
 * story and its number. The current edition is indexed at its own address,
 * which is the one to link; an earlier one is not, since the current says the
 * same and more. A private or hidden story's are neither described nor indexed.
 */
export async function editionMetadata(
  api: Api,
  input: { slug: string; number?: number },
): Promise<Metadata> {
  const edition = await api.publication.get(input)
  const data = await api.storyboard.get({ slug: input.slug, versionId: edition.versionId })
  const { storyboard } = data
  const title = `${storyboard.title}, edition ${String(edition.number)}`
  if (!readableByAnyone(storyboard)) return { title, robots: PRIVATE }

  const description = storyboard.logline?.trim()
    ? excerpt(storyboard.logline)
    : await sectionText(api, storyboard.type, opening(data.chapters))
  return {
    title,
    ...(description ? { description } : {}),
    ...(edition.current
      ? { alternates: { canonical: `/s/${storyboard.slug}/published` } }
      : { robots: NOT_INDEXED }),
  }
}

/** Screen 14 — named for its story; described and indexed only when anyone may read it. */
export async function contributorsMetadata(api: Api, slug: string): Promise<Metadata> {
  const { storyboard } = await api.storyboard.get({ slug })
  const title = `Contributors to ${storyboard.title}`
  if (!readableByAnyone(storyboard)) return { title, robots: PRIVATE }
  return {
    title,
    description: `Everyone who helped write ${storyboard.title}, and what each of them did.`,
    alternates: { canonical: `/s/${storyboard.slug}/contributors` },
  }
}

/** Screen 8 — "{title} — a stuck point in {story}", with its ask. */
export async function requestMetadata(api: Api, publicId: string): Promise<Metadata> {
  const { request } = await api.request.get({ publicId })
  const story = request.storyboard
  const title = `${request.title} — a stuck point in ${story.title}`
  if (!readableByAnyone(story)) return { title, robots: PRIVATE }
  return {
    title,
    description: excerpt(request.ask),
    alternates: { canonical: `/s/${story.slug}/help/${request.publicId}` },
  }
}

/**
 * Screen 10 — a suggestion, named for the person who wrote it and the story.
 * A comparison of somebody's draft against the text it would replace, so it
 * is never indexed (item 9.8), and the description names the request rather
 * than quoting the suggestion.
 */
export async function suggestionMetadata(api: Api, publicId: string): Promise<Metadata> {
  const { suggestion } = await api.suggestion.get({ publicId })
  const { request } = suggestion
  return {
    title: `${nameOf(suggestion.contributor)}’s suggestion — ${request.storyboard.title}`,
    description: `A suggestion for “${request.title}”, a stuck point in ${request.storyboard.title}.`,
    robots: NOT_INDEXED,
  }
}
