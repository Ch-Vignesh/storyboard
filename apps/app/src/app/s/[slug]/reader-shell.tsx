'use client'

import { Button } from '@storyboard/ui/components/button'
import { cn } from '@storyboard/ui/cn'
import { useQuery } from '@tanstack/react-query'
import Link from '@/components/link'
import { useEffect, useRef, useState } from 'react'

import { Manuscript } from '@/components/manuscript'

import { LineageBanner } from './lineage-banner'
import { CopyLink } from '@/components/copy-link'
import { ExampleLabel } from '@/components/example-label'
import { HeaderMenu } from '@/components/header-menu'
import { UserAvatar } from '@/components/user-avatar'
import { ownShareSentence } from '@/lib/own-share'
import { ReadingControls } from '@/components/reading-controls'
import { ReportButton } from '@/components/report-button'
import { flavourForStoryType } from '@/lib/doc/schema'
import { nameOf, type Person } from '@/lib/people'
import type { Reading } from '@/lib/reading'
import { REQUEST_KINDS } from '@/lib/schemas/help'
import { formatInZone } from '@/lib/time-zone'
import { useTRPC } from '@/trpc/client'
import type { AppRouter } from '@/server/trpc/routers/_app'
import type { inferRouterOutputs } from '@trpc/server'

type StoryboardData = inferRouterOutputs<AppRouter>['storyboard']['get']
type MarginRequest = inferRouterOutputs<AppRouter>['request']['listForStoryboard'][number]

/** Item 7.3 — one person in the contributors strip, worded on the server. */
export type StripPerson = {
  key: string
  person: Person
  name: string
  /** Their profile, when there is one to link to (decision 0013). */
  href: string | null
  line: string
}

/** Where a section reads, counted from 0 here and from 1 in its address. */
type Position = { chapterId: string; chapterIndex: number; sectionIndex: number }

type Located = { request: MarginRequest; position: Position }

/**
 * Item 7.1 — how long a passage stays marked after its margin card, or its
 * address, took the reader to it, unless they do something first.
 */
const HIGHLIGHT_MS = 2500

export function ReaderShell({
  data,
  signedIn,
  header,
  notice,
  account,
  startAt,
  contributors,
  reading,
  lastWritten,
  edition,
  publishedNote,
  timeZone,
}: {
  data: StoryboardData
  signedIn: boolean
  header: React.ReactNode
  /** Shown under the header, across the page: the deletion banner (item 1.5). */
  notice?: React.ReactNode
  /** Item 4.1 — the account end of the site header, shared with it. */
  account?: React.ReactNode
  /** A chapter's or a section's address was followed (SRS section 4). */
  startAt?: { chapterId: string; sectionId?: string }
  /** Item 7.3 — the strip in the margin; none on a finished story. */
  contributors?: { total: number; people: StripPerson[] } | null
  /** Item 7.5 — the type size and line height the page was drawn at. */
  reading: Reading
  /** Item 7.6 — "last written on 9 September", in the reader's zone. */
  lastWritten?: string | null
  /**
   * Decision 0044 (item 7b.2) — reading a published edition: a still page,
   * like a finished story's, whose chapter links stay inside the edition.
   */
  edition?: { line: string; note: string | null; base: string; current: boolean } | null
  /** Item 7b.2 — on the working draft, the published edition there is. */
  publishedNote?: { text: string; href: string } | null
  /** Item 1.18 — the reader's zone, so the server and the browser draw the same days. */
  timeZone: string
}) {
  const trpc = useTRPC()
  const { storyboard, chapters, permissions, historyVisibleFrom, privateStretches, version } = data
  // FR-11.5, SRS section 4 (phase 14, item 1.14) — the chapter being read is
  // the one the address names. It was state here, so a reload went back to
  // chapter one and Back left the story. The shell is keyed by chapter in
  // reader.tsx, so arriving at another chapter starts it afresh.
  const activeChapterId = startAt?.chapterId ?? chapters[0]?.id ?? null
  // On arrival at a chapter's address, its heading takes focus, so a keyboard
  // or screen-reader user starts where the address points. A section's
  // address scrolls to the section instead (below).
  const heading = useRef<HTMLHeadingElement>(null)
  const arrivedAtChapter = startAt?.chapterId !== undefined && startAt.sectionId === undefined
  useEffect(() => {
    if (arrivedAtChapter) heading.current?.focus({ preventScroll: true })
  }, [arrivedAtChapter])

  // FR-11.5 (item 7.1) — a passage is lit while a margin card is hovered or
  // focused, and marked for a moment when a card or an address takes the
  // reader to it. The mark used to stay for good.
  const [hovered, setHovered] = useState<string | null>(null)
  const [highlighted, setHighlighted] = useState<string | null>(startAt?.sectionId ?? null)
  useEffect(() => {
    if (!highlighted) return
    const clear = () => {
      setHighlighted(null)
    }
    const timer = window.setTimeout(clear, HIGHLIGHT_MS)
    // Or at the next thing the reader does. Added after the render that set
    // the mark, so the click that set it is not that next thing.
    document.addEventListener('pointerdown', clear, { once: true })
    document.addEventListener('keydown', clear, { once: true })
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('pointerdown', clear)
      document.removeEventListener('keydown', clear)
    }
  }, [highlighted])
  const flavour = flavourForStoryType(storyboard.type)

  // NFR-1 — one chapter at a time. A 120,000-word manuscript is never one
  // payload; the rail is cheap because it carries counts, not prose. The
  // opening chapter comes with the page (item 7.4), so this starts filled.
  const chapter = useQuery({
    ...trpc.section.listForChapter.queryOptions({ chapterId: activeChapterId ?? '' }),
    enabled: activeChapterId !== null,
  })

  // Once, when the chapter it is in has loaded: after that, the reader is
  // where the reader has scrolled to.
  const arrived = useRef(false)
  const startSection = startAt?.sectionId
  useEffect(() => {
    if (!startSection || arrived.current || !chapter.data) return
    arrived.current = true
    document.getElementById(`section-${startSection}`)?.scrollIntoView({ block: 'start' })
  }, [chapter.data, startSection])

  // FR-14.1 — a finished storyboard is the work, not the workshop: no margin,
  // no request cards, and the contributors linked from the foot instead.
  const finished = storyboard.state === 'FINISHED'
  // Decision 0044 — an edition is read as a finished story is: no margin, no
  // asking for help, and no writing into it.
  const isEdition = Boolean(edition)
  const quiet = finished || isEdition

  // FR-11.5 — the margin of open requests, each tied to its section. A
  // finished storyboard has none, and does not ask for them either.
  const requests = useQuery({
    ...trpc.request.listForStoryboard.queryOptions({ storyboardId: storyboard.id }),
    enabled: !quiet,
  })

  // Requests are asked of the main draft's sections, so an alternate version
  // shows none. Each is placed in reading order (item 7.2), which is how the
  // margin orders them and how their addresses count.
  const positions = new Map<string, Position>()
  for (const [chapterIndex, entry] of chapters.entries()) {
    for (const [sectionIndex, section] of entry.sections.entries()) {
      positions.set(section.id, { chapterId: entry.id, chapterIndex, sectionIndex })
    }
  }
  const located: Located[] = []
  for (const request of version.isMain ? (requests.data ?? []) : []) {
    const position = positions.get(request.sectionId)
    if (position) located.push({ request, position })
  }
  located.sort(
    (a, b) =>
      a.position.chapterIndex - b.position.chapterIndex ||
      a.position.sectionIndex - b.position.sectionIndex,
  )
  const here = located.filter((entry) => entry.position.chapterId === activeChapterId)
  const elsewhere = located.filter((entry) => entry.position.chapterId !== activeChapterId)
  const chaptersWithRequests = new Set(located.map((entry) => entry.position.chapterId))
  const requestsBySection = new Map<string, MarginRequest[]>()
  for (const { request } of here) {
    requestsBySection.set(request.sectionId, [
      ...(requestsBySection.get(request.sectionId) ?? []),
      request,
    ])
  }

  const activeIndex = chapters.findIndex((entry) => entry.id === activeChapterId)
  // FR-10.1 — a link out of an alternate version stays in that version.
  const versionSuffix = version.isMain ? '' : `?version=${encodeURIComponent(version.id)}`
  const strip = contributors && contributors.people.length > 0 ? contributors : null
  // From the prototype's width up, the margin is a column of its own; below
  // it, the cards sit under their sections and the rest follows the text.
  const hasMargin = !quiet && (located.length > 0 || strip !== null)

  /** Item 7.1 — to the passage: scrolled to, focused, and marked for a moment. */
  function showSection(sectionId: string) {
    const element = document.getElementById(`section-${sectionId}`)
    if (!element) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    element.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' })
    element.focus({ preventScroll: true })
    setHighlighted(sectionId)
  }

  // Item 7b.2 — inside an edition, a chapter is a page of the edition.
  const chapterHref = (index: number) =>
    edition
      ? `${edition.base}?chapter=${String(index + 1)}`
      : `/s/${storyboard.slug}/c/${String(index + 1)}${versionSuffix}`

  const sectionAddress = (position: Position) =>
    `/s/${storyboard.slug}/c/${String(position.chapterIndex + 1)}/${String(position.sectionIndex + 1)}`

  return (
    <div className="min-h-screen">
      {/* Item 7.9 — printed, a story is its text: no header, rail, margin or buttons. */}
      <header className="sticky top-0 z-10 border-b border-rule bg-paper/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-3 min-[1100px]:max-w-[1360px]">
          {header}
          <div className="flex flex-wrap items-center justify-end gap-3">
            {/* Item 4.3 — below `xl` everything but the one primary action
                folds behind "More"; from `xl` up this is the row it was. It
                folded below `md`, and an author's row, a dozen buttons and
                the account, scrolled a tablet and a 1024 px laptop sideways
                (2026-10-26 final pass). It may wrap, too, beside a long title. */}
            {permissions.canOpenRequest && !quiet ? (
              <Button asChild variant="ghost" size="sm" className="xl:hidden">
                <Link href={`/s/${storyboard.slug}/help/new`}>Ask for help</Link>
              </Button>
            ) : null}
            {!signedIn ? (
              <Button asChild variant="primary" size="sm" className="xl:hidden">
                <Link href={`/signin?next=/s/${storyboard.slug}`}>Sign in to help</Link>
              </Button>
            ) : null}
            <HeaderMenu label="More" from="xl">
              {/* NFR-5 (item 7.5) — for a guest too, kept on their device. */}
              <ReadingControls initial={reading} signedIn={signedIn} />
              <Button asChild variant="ghost" size="sm">
                <Link href={`/s/${storyboard.slug}/contributors`}>Contributors</Link>
              </Button>
              {/* Item 6.11 — the story's address, to hand to someone. */}
              <CopyLink path={`/s/${storyboard.slug}`} appearance="ghost" />
              {/* FR-10.3 — the way to the spin-off button, which lives with the
                story's family tree. Nothing led there for a story nobody had
                spun off yet, until the 2026-10-16 spec review. */}
              {signedIn && permissions.canSpinOff && storyboard.visibility === 'PUBLIC' ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/s/${storyboard.slug}/lineage`}>Your own version</Link>
                </Button>
              ) : null}
              {/* FR-10.1 — an author has drafts; a reader has none to see. */}
              {permissions.canCreateVersion ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/s/${storyboard.slug}/versions`}>Versions</Link>
                </Button>
              ) : null}
              {/* SRS 3.1 — who writes it, for the people who do. */}
              {permissions.canEdit ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/s/${storyboard.slug}/coauthors`}>Co-authors</Link>
                </Button>
              ) : null}
              {permissions.canExport ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/s/${storyboard.slug}/export`}>Take it out</Link>
                </Button>
              ) : null}
              {permissions.canOpenRequest && !quiet ? (
                <Button asChild variant="ghost" size="sm" className="hidden xl:inline-flex">
                  <Link href={`/s/${storyboard.slug}/help/new`}>Ask for help</Link>
                </Button>
              ) : null}
              {permissions.canStructure && !isEdition ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/s/${storyboard.slug}/contents${versionSuffix}`}>Contents</Link>
                </Button>
              ) : null}
              {/* Item 8.10 — a co-author edits the details too. */}
              {permissions.canEdit && !isEdition ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/s/${storyboard.slug}/settings`}>Settings</Link>
                </Button>
              ) : null}
              {/* FR-13.5 (item 7.8) — for anyone who is not one of its authors;
                  the form itself is at the foot, where there is room for it. */}
              {!permissions.canEdit ? (
                <Button asChild variant="ghost" size="sm">
                  <a href="#report">Report this story</a>
                </Button>
              ) : null}
              {/* FR-1.2 — the account wall sits in front of helping, not reading. */}
              {!signedIn ? (
                <Button asChild variant="primary" size="sm" className="hidden xl:inline-flex">
                  <Link href={`/signin?next=/s/${storyboard.slug}`}>Sign in to help</Link>
                </Button>
              ) : null}
              {account}
            </HeaderMenu>
          </div>
        </div>
      </header>
      {notice}

      {/* Item 7.1 — the prototype's three columns: contents, the page, and
          the margin, from the width the prototype gave them room at. */}
      <div className="mx-auto flex max-w-6xl gap-10 px-6 py-10 min-[1100px]:max-w-[1360px] print:block print:max-w-none print:p-0">
        {/* Contents rail */}
        <nav aria-label="Contents" className="hidden w-[216px] shrink-0 lg:block print:hidden">
          <div className="sticky top-20">
            <p className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
              Contents
            </p>
            <ChapterList
              chapters={chapters}
              activeChapterId={activeChapterId}
              hrefFor={chapterHref}
              open={chaptersWithRequests}
            />
          </div>
        </nav>

        {/* Manuscript */}
        <main id="main" tabIndex={-1} className="min-w-0 flex-1">
          {/* Item 4.3 — below `lg` the rail is gone; the same list opens here. */}
          <nav aria-label="Chapters" className="mb-6 lg:hidden print:hidden">
            <HeaderMenu
              label="Chapters"
              from="lg"
              panel="inline"
              wide="hidden"
              buttonClassName="rounded-control border border-rule px-2.5 py-1 text-[13px] text-ink-soft hover:border-ink-faint hover:text-ink"
            >
              <ChapterList
                chapters={chapters}
                activeChapterId={activeChapterId}
                hrefFor={chapterHref}
                open={chaptersWithRequests}
              />
            </HeaderMenu>
          </nav>
          <header className="mb-10">
            {storyboard.isSeed ? (
              // FR-15.3 — a seeded storyboard never looks like a real user's.
              <p className="mb-2">
                <ExampleLabel />
              </p>
            ) : null}
            <h1 className="font-manuscript text-[34px] leading-tight font-medium text-ink">
              {storyboard.title}
            </h1>
            <p className="mt-2 text-[13.5px] text-ink-soft">
              by{' '}
              {storyboard.owner.username ? (
                <Link
                  href={`/@${storyboard.owner.username}`}
                  className="text-pencil hover:underline"
                >
                  {nameOf(storyboard.owner)}
                </Link>
              ) : (
                nameOf(storyboard.owner)
              )}
              {storyboard.genres.length > 0
                ? ` · ${storyboard.genres.map((genre) => genre.name).join(', ')}`
                : ''}
              {' · '}
              <span className="tabular-nums">
                {storyboard.wordCount.toLocaleString('en-GB')} words
              </span>
              {storyboard.visibility === 'PRIVATE' ? ' · private' : ''}
              {lastWritten ? ` · ${lastWritten}` : ''}
            </p>
            {/* Item 6.17 (decision 0041) — beside the contributors: how much is the author's own. */}
            {ownShareSentence(storyboard.ownShare) ? (
              <p className="mt-1 text-[12.5px] text-ink-faint">
                {ownShareSentence(storyboard.ownShare)}.
              </p>
            ) : null}
            {storyboard.logline ? (
              <p className="mt-4 max-w-measure font-manuscript text-[17px] leading-relaxed text-ink-soft italic">
                {storyboard.logline}
              </p>
            ) : null}
          </header>

          {/* Decision 0044 (item 7b.2) — which edition this is, and the way back
              to the live story for the people who help write it. */}
          {edition ? (
            <p className="mb-8 max-w-measure border-l-2 border-pencil/50 bg-pencil-wash/40 py-1.5 pl-4 text-[12.5px] leading-relaxed text-ink-soft">
              {edition.line}.{edition.note ? <span className="italic"> {edition.note}</span> : null}{' '}
              {!edition.current ? (
                <>
                  <Link
                    href={`/s/${storyboard.slug}/published`}
                    className="text-pencil hover:underline"
                  >
                    Read the current edition
                  </Link>
                  {signedIn ? ' · ' : null}
                </>
              ) : null}
              {signedIn ? (
                <Link href={`/s/${storyboard.slug}`} className="text-pencil hover:underline">
                  Read the working draft
                </Link>
              ) : null}
            </p>
          ) : publishedNote && version.isMain ? (
            <p className="mb-8 max-w-measure border-l-2 border-pencil/50 py-1 pl-4 text-[12.5px] leading-relaxed text-ink-faint">
              {publishedNote.text}.{' '}
              <Link href={publishedNote.href} className="text-pencil hover:underline">
                Read the edition
              </Link>
              . This is the working draft, which keeps changing.
            </p>
          ) : null}

          {/* FR-10.1 — reading an alternate is never a surprise. */}
          {!version.isMain && !isEdition ? (
            <p className="mb-8 max-w-measure border-l-2 border-ochre/50 bg-ochre-wash/40 py-1.5 pl-4 text-[12.5px] leading-relaxed text-ink-soft">
              You are reading {version.name}, an alternate version.{' '}
              <Link href={`/s/${storyboard.slug}`} className="text-pencil hover:underline">
                Read the main draft
              </Link>
              .
            </p>
          ) : null}

          {/* FR-10.4 to FR-10.6 — where this came from, and who took it on. */}
          <LineageBanner storyboardId={storyboard.id} slug={storyboard.slug} timeZone={timeZone} />

          {/* FR-14.5 — as the author wrote it, unverified and unendorsed. It
              was stored and exported and never shown, until the 2026-10-16
              spec review. */}
          {storyboard.rightsNote ? (
            <p className="mb-8 max-w-measure border-l-2 border-rule py-1 pl-4 text-[12.5px] leading-relaxed text-ink-faint">
              From the author, about rights:{' '}
              <span className="whitespace-pre-line text-ink-soft italic">
                {storyboard.rightsNote}
              </span>
            </p>
          ) : null}

          {/* Decision 0007 — say so rather than letting history look incomplete. */}
          {historyVisibleFrom ? (
            <p className="mb-8 max-w-measure border-l-2 border-rule py-1 pl-4 text-[12.5px] leading-relaxed text-ink-faint">
              This story was private until {formatInZone(historyVisibleFrom, 'long', timeZone)}.
              Versions written before then are visible to its authors only.
            </p>
          ) : null}
          {/* Decision 0039 — and so was what was written while it was private again. */}
          {privateStretches.length > 0 ? (
            <p className="mb-8 max-w-measure border-l-2 border-rule py-1 pl-4 text-[12.5px] leading-relaxed text-ink-faint">
              It was private again{' '}
              {privateStretches
                .map(
                  (stretch) =>
                    `from ${formatInZone(stretch.from, 'long', timeZone)} to ${formatInZone(stretch.to, 'long', timeZone)}`,
                )
                .join(', and ')}
              . Versions written then are visible to its authors only.
            </p>
          ) : null}

          {/* FR-14.1 — said once, at the top, and then got out of the way. */}
          {finished ? (
            <p className="mb-8 max-w-measure text-[12.5px] leading-relaxed text-ink-faint">
              Finished
              {storyboard.finishedAt
                ? ` ${formatInZone(storyboard.finishedAt, 'long', timeZone)}`
                : ''}
              .
            </p>
          ) : null}

          {chapters.length === 0 ? (
            <p className="text-ink-soft">This story has no chapters yet.</p>
          ) : (
            <article>
              <h2
                ref={heading}
                tabIndex={-1}
                data-chapter-heading
                className="font-manuscript text-[24px] font-medium text-ink"
              >
                {chapters[activeIndex]?.title}
              </h2>

              {chapter.isPending ? (
                <p className="mt-6 text-[13.5px] text-ink-faint">Loading…</p>
              ) : chapter.isError ? (
                // A chapter that would not load showed its title over nothing,
                // which reads as a chapter with no text (phase 12 audit).
                <p role="alert" className="mt-6 text-[13.5px] text-crimson">
                  This chapter could not be loaded.{' '}
                  <button
                    type="button"
                    className="text-pencil underline"
                    onClick={() => void chapter.refetch()}
                  >
                    Try again
                  </button>
                </p>
              ) : (
                <div className="manuscript mt-6 max-w-measure">
                  {(chapter.data ?? []).map((section, position) => {
                    const lit = hovered === section.id || highlighted === section.id
                    const cards = requestsBySection.get(section.id) ?? []
                    return (
                      <section
                        key={section.id}
                        id={`section-${section.id}`}
                        // Item 7.1 — a margin card focuses the passage it
                        // belongs to, so the reader carries on from there.
                        tabIndex={-1}
                        className={cn(
                          'relative -mx-4 scroll-mt-20 rounded-control px-4 transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-pencil/40',
                          lit && 'bg-ochre-wash',
                        )}
                      >
                        {section.title ? (
                          <h3 className="font-manuscript text-[19px] font-medium">
                            {section.title}
                          </h3>
                        ) : null}
                        <Manuscript
                          content={section.currentRevision?.contentJson}
                          flavour={flavour}
                        />
                        {section.wordCount === 0 ? (
                          <p className="text-[13.5px] text-ink-faint italic">
                            This section is empty.
                          </p>
                        ) : null}
                        {/* FR-11.5 — below the margin's width, each card sits
                            under its section; from it up, they are in the
                            margin and these are not drawn. */}
                        {cards.length > 0 ? (
                          <div className="not-prose mb-6 space-y-3 min-[1100px]:hidden print:hidden">
                            {cards.map((request) => (
                              <RequestCard
                                key={request.id}
                                request={request}
                                slug={storyboard.slug}
                                lit={lit}
                                onShow={() => {
                                  showSection(section.id)
                                }}
                              />
                            ))}
                          </div>
                        ) : null}

                        {permissions.canEdit && !isEdition ? (
                          <p className="not-prose mb-8 text-[12.5px] print:hidden">
                            <Link
                              href={`/s/${storyboard.slug}/c/${activeIndex + 1}/${position + 1}/edit${versionSuffix}`}
                              className="text-pencil hover:underline"
                            >
                              Edit
                            </Link>
                            {' · '}
                            <Link
                              href={`/s/${storyboard.slug}/c/${activeIndex + 1}/${position + 1}/history${versionSuffix}`}
                              className="text-ink-faint hover:text-ink hover:underline"
                            >
                              History
                            </Link>
                            {!finished && permissions.canOpenRequest && cards.length === 0 ? (
                              <>
                                {' · '}
                                <Link
                                  href={`/s/${storyboard.slug}/help/new?section=${section.id}`}
                                  className="text-ochre hover:underline"
                                >
                                  Ask for help here
                                </Link>
                              </>
                            ) : null}
                          </p>
                        ) : null}
                      </section>
                    )
                  })}
                </div>
              )}

              <nav className="mt-12 flex justify-between border-t border-rule pt-5 print:hidden">
                {/* Real links to the chapters' addresses (item 1.14). */}
                {activeIndex > 0 ? (
                  <Link
                    href={chapterHref(activeIndex - 1)}
                    className="text-[13.5px] text-pencil hover:underline"
                  >
                    ← {chapters[activeIndex - 1]!.title}
                  </Link>
                ) : (
                  <span />
                )}
                {activeIndex < chapters.length - 1 ? (
                  <Link
                    href={chapterHref(activeIndex + 1)}
                    className="text-[13.5px] text-pencil hover:underline"
                  >
                    {chapters[activeIndex + 1]!.title} →
                  </Link>
                ) : (
                  <span />
                )}
              </nav>

              {/* FR-13.5 (item 7.8) — reporting the story itself, for a reader
                  who is not one of its authors: a guest is asked to sign in,
                  and someone who has reported it already is told so. */}
              {!permissions.canEdit ? (
                <section
                  id="report"
                  aria-label="Report this story"
                  className="mt-10 max-w-measure scroll-mt-24 print:hidden"
                >
                  <ReportButton targetType="STORYBOARD" targetId={storyboard.id} />
                </section>
              ) : null}

              {/* FR-14.1 — the contributors, linked from the foot. On a
                  finished manuscript this is the last thing a reader sees,
                  which is the right place for it. */}
              {quiet ? (
                <p className="mt-12 max-w-measure border-t border-rule pt-6 text-[13px] text-ink-faint">
                  <Link
                    href={`/s/${storyboard.slug}/contributors`}
                    className="text-pencil hover:underline"
                  >
                    Everyone who helped write this
                  </Link>
                </p>
              ) : null}
            </article>
          )}

          {/* Items 7.2 and 7.3 — below the margin's width, what the margin
              ends with follows the manuscript instead. */}
          {hasMargin && (elsewhere.length > 0 || strip) ? (
            <div className="mt-12 max-w-measure space-y-10 border-t border-rule pt-8 min-[1100px]:hidden print:hidden">
              <Elsewhere entries={elsewhere} chapters={chapters} address={sectionAddress} />
              <ContributorsStrip strip={strip} slug={storyboard.slug} />
            </div>
          ) : null}
        </main>

        {/* FR-11.5 (item 7.1) — the margin: this chapter's open requests in
            section order, then the rest of the story's, then who helped. */}
        {hasMargin ? (
          <aside
            aria-label="In the margin"
            className="hidden w-[320px] shrink-0 min-[1100px]:block print:hidden"
          >
            <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pb-10 pl-6">
              <h2 className="mb-3.5 text-[12.5px] font-semibold text-ink-faint">In the margin</h2>
              {here.length > 0 ? (
                <ul className="space-y-3">
                  {here.map(({ request }) => (
                    <li key={request.id}>
                      <RequestCard
                        request={request}
                        slug={storyboard.slug}
                        lit={hovered === request.sectionId || highlighted === request.sectionId}
                        leader
                        onHover={(on) => {
                          setHovered(on ? request.sectionId : null)
                        }}
                        onShow={() => {
                          showSection(request.sectionId)
                        }}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[12.5px] leading-relaxed text-ink-faint">
                  Nothing in this chapter is open for help.
                </p>
              )}
              <div className="mt-8 space-y-8">
                <Elsewhere entries={elsewhere} chapters={chapters} address={sectionAddress} />
                <ContributorsStrip strip={strip} slug={storyboard.slug} />
              </div>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  )
}

/**
 * FR-11.5 (item 7.1) — one open request, as the prototype's margin card: what
 * kind of help, the title, the start of the ask, its size and its answers.
 * The card takes the reader to its passage; opening the request is its own
 * link, so neither is a surprise. In the margin, a leader rule runs from the
 * card's left edge towards the text, and thickens and turns blue pencil while
 * its passage is lit.
 */
function RequestCard({
  request,
  slug,
  lit,
  leader = false,
  onHover,
  onShow,
}: {
  request: MarginRequest
  slug: string
  lit: boolean
  leader?: boolean
  onHover?: (on: boolean) => void
  onShow: () => void
}) {
  const kind = REQUEST_KINDS.find((option) => option.value === request.kind)
  const answers = request.kind === 'UNBLOCK' ? request._count.ideas : request._count.suggestions
  const answerWords =
    request.kind === 'UNBLOCK'
      ? `${String(answers)} ${answers === 1 ? 'idea' : 'ideas'}`
      : `${String(answers)} ${answers === 1 ? 'suggestion' : 'suggestions'}`

  return (
    <div
      className="group relative"
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      onFocus={() => onHover?.(true)}
      onBlur={(event) => {
        // Still lit while focus moves between the card's own controls.
        if (!event.currentTarget.contains(event.relatedTarget)) onHover?.(false)
      }}
    >
      {leader ? (
        <span
          aria-hidden
          className={cn(
            'absolute top-5 -left-6 w-6 transition-all duration-200',
            lit
              ? 'h-0.5 bg-pencil'
              : 'h-px bg-rule group-focus-within:h-0.5 group-focus-within:bg-pencil group-hover:h-0.5 group-hover:bg-pencil',
          )}
        />
      ) : null}
      <div
        className={cn(
          'rounded-[3px] border bg-paper shadow-lift transition-colors duration-200',
          lit
            ? 'border-pencil'
            : 'border-rule group-focus-within:border-pencil group-hover:border-pencil',
        )}
      >
        <button
          type="button"
          className="block w-full px-3.5 pt-3 pb-1.5 text-left"
          onClick={onShow}
        >
          <span className="sr-only">Show the passage: </span>
          <span className="block text-[11.5px] font-medium text-ochre">{kind?.wants}</span>
          <span className="mt-1 block text-[14px] leading-snug font-medium text-ink">
            {request.title}
          </span>
          <span className="mt-1 line-clamp-2 block text-[12.5px] leading-snug text-ink-soft">
            {request.ask}
          </span>
        </button>
        <div className="flex flex-wrap items-center gap-2 px-3.5 pt-1 pb-3 text-[12px] text-ink-faint">
          {request.kind !== 'UNBLOCK' ? (
            <span className="border border-ochre/40 bg-ochre-wash px-1.5 text-ochre tabular-nums">
              {request.minWords}–{request.maxWords} words
            </span>
          ) : null}
          <span>{answerWords}</span>
          <Link
            href={`/s/${slug}/help/${request.publicId}`}
            className="ml-auto text-ochre underline-offset-2 hover:underline"
          >
            Read what they need<span className="sr-only">: {request.title}</span> →
          </Link>
        </div>
      </div>
    </div>
  )
}

/**
 * Item 7.2 — open requests in the story's other chapters, so a reader on
 * chapter one still finds the stuck point in chapter four. Each links to its
 * section's address.
 */
function Elsewhere({
  entries,
  chapters,
  address,
}: {
  entries: Located[]
  chapters: StoryboardData['chapters']
  address: (position: Position) => string
}) {
  if (entries.length === 0) return null
  return (
    <section>
      <h2 className="mb-2.5 text-[12.5px] font-semibold text-ink-faint">Elsewhere in this story</h2>
      <ul className="space-y-2">
        {entries.map(({ request, position }) => (
          <li key={request.id} className="text-[13px] leading-snug">
            <Link href={address(position)} className="text-ink hover:text-pencil hover:underline">
              {request.title}
            </Link>
            <span className="block text-[12px] text-ink-faint">
              {REQUEST_KINDS.find((option) => option.value === request.kind)?.wants} ·{' '}
              {String(position.chapterIndex + 1)}. {chapters[position.chapterIndex]?.title}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Item 7.3 (FR-9.2) — who has helped, most recent first, with a line each,
 * and the way to everyone. Nothing when nobody has.
 */
function ContributorsStrip({
  strip,
  slug,
}: {
  strip: { total: number; people: StripPerson[] } | null
  slug: string
}) {
  if (!strip) return null
  return (
    <section>
      <h2 className="mb-2.5 text-[12.5px] font-semibold text-ink-faint">Contributors</h2>
      <ul className="space-y-2.5">
        {strip.people.map((entry) => (
          <li key={entry.key} className="flex items-start gap-2.5">
            <UserAvatar person={entry.person} size="md" />
            <div className="min-w-0 text-[13px] leading-snug">
              {entry.href ? (
                <Link href={entry.href} className="font-medium text-ink hover:text-pencil">
                  {entry.name}
                </Link>
              ) : (
                <span className="text-ink-soft italic">{entry.name}</span>
              )}
              <span className="block text-[12px] text-ink-faint">{entry.line}</span>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[12.5px]">
        <Link href={`/s/${slug}/contributors`} className="text-pencil hover:underline">
          All contributors
          {strip.total > strip.people.length ? ` (${String(strip.total)})` : ''}
        </Link>
      </p>
    </section>
  )
}

/**
 * The chapter list: the rail from `lg` up, and the "Chapters" disclosure
 * below it (item 4.3). One component, so the two never drift. A chapter with
 * an open request carries an ochre dot, said in words to a screen reader
 * (item 7.2).
 */
function ChapterList({
  chapters,
  activeChapterId,
  hrefFor,
  open,
}: {
  chapters: StoryboardData['chapters']
  activeChapterId: string | null
  /** The address of a chapter, by its index: the story's, or an edition's. */
  hrefFor: (index: number) => string
  open: ReadonlySet<string>
}) {
  return (
    <ol className="mt-3 w-full space-y-0.5">
      {chapters.map((entry, index) => (
        <li key={entry.id}>
          <Link
            href={hrefFor(index)}
            aria-current={entry.id === activeChapterId ? 'page' : undefined}
            className={
              entry.id === activeChapterId
                ? 'block w-full border-l-2 border-pencil bg-pencil-wash py-1.5 pl-3 text-left text-[13.5px] text-pencil'
                : 'block w-full border-l-2 border-transparent py-1.5 pl-3 text-left text-[13.5px] text-ink-soft hover:border-rule hover:text-ink'
            }
          >
            <span className="flex items-center gap-2">
              <span className="block truncate">
                {index + 1}. {entry.title}
                {open.has(entry.id) ? <span className="sr-only">, open for help</span> : null}
              </span>
              {open.has(entry.id) ? (
                <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-ochre" />
              ) : null}
            </span>
            {/* The active chapter sits on a pencil wash, and the faint ink
                that clears 4.5:1 on paper only reaches 4.0:1 on it (NFR-4).
                Tinted ground, darker ink. */}
            <span
              className={
                entry.id === activeChapterId
                  ? 'mt-0.5 block text-[11.5px] text-pencil-deep tabular-nums'
                  : 'mt-0.5 block text-[11.5px] text-ink-faint tabular-nums'
              }
            >
              {entry.sections
                .reduce((total, section) => total + section.wordCount, 0)
                .toLocaleString('en-GB')}{' '}
              words
            </span>
          </Link>
        </li>
      ))}
    </ol>
  )
}
