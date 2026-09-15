'use client'

import { Button } from '@storyboard/ui/components/button'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'

import { Manuscript } from '@/components/manuscript'

import { LineageBanner } from './lineage-banner'
import { ReadingControls } from '@/components/reading-controls'
import { flavourForStoryType } from '@/lib/doc/schema'
import { nameOf } from '@/lib/people'
import { useTRPC } from '@/trpc/client'
import type { AppRouter } from '@/server/trpc/routers/_app'
import type { inferRouterOutputs } from '@trpc/server'

type StoryboardData = inferRouterOutputs<AppRouter>['storyboard']['get']

export function ReaderShell({
  data,
  signedIn,
  header,
}: {
  data: StoryboardData
  signedIn: boolean
  header: React.ReactNode
}) {
  const trpc = useTRPC()
  const { storyboard, chapters, permissions, historyVisibleFrom, version } = data
  const [activeChapterId, setActiveChapterId] = useState(chapters[0]?.id ?? null)
  // FR-11.5 — clicking a margin card scrolls to its section and highlights it.
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const flavour = flavourForStoryType(storyboard.type)

  // NFR-1 — one chapter at a time. A 120,000-word manuscript is never one
  // payload; the rail is cheap because it carries counts, not prose.
  const chapter = useQuery({
    ...trpc.section.listForChapter.queryOptions({ chapterId: activeChapterId ?? '' }),
    enabled: activeChapterId !== null,
  })

  // FR-11.5 — the margin of open requests, each tied to its section. A
  // finished storyboard has none, and does not ask for them either.
  const requests = useQuery({
    ...trpc.request.listForStoryboard.queryOptions({ storyboardId: storyboard.id }),
    enabled: storyboard.state !== 'FINISHED',
  })
  const requestsBySection = new Map<string, NonNullable<typeof requests.data>>()
  for (const request of requests.data ?? []) {
    const existing = requestsBySection.get(request.sectionId) ?? []
    requestsBySection.set(request.sectionId, [...existing, request])
  }

  const activeIndex = chapters.findIndex((entry) => entry.id === activeChapterId)
  // FR-14.1 — a finished storyboard is the work, not the workshop: no margin,
  // no request cards, and the contributors linked from the foot instead.
  const finished = storyboard.state === 'FINISHED'
  // FR-10.1 — a link out of an alternate version stays in that version.
  const versionSuffix = version.isMain ? '' : `?version=${encodeURIComponent(version.id)}`

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-rule bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-3">
          {header}
          <div className="flex items-center gap-3">
            {signedIn ? <ReadingControls /> : null}
            <Button asChild variant="ghost" size="sm">
              <Link href={`/s/${storyboard.slug}/contributors`}>Contributors</Link>
            </Button>
            {/* FR-10.1 — an author has drafts; a reader has none to see. */}
            {permissions.canCreateVersion ? (
              <Button asChild variant="ghost" size="sm">
                <Link href={`/s/${storyboard.slug}/versions`}>Versions</Link>
              </Button>
            ) : null}
            {permissions.canExport ? (
              <Button asChild variant="ghost" size="sm">
                <Link href={`/s/${storyboard.slug}/export`}>Take it out</Link>
              </Button>
            ) : null}
            {permissions.canOpenRequest && !finished ? (
              <Button asChild variant="ghost" size="sm">
                <Link href={`/s/${storyboard.slug}/help/new`}>Ask for help</Link>
              </Button>
            ) : null}
            {permissions.canStructure ? (
              <Button asChild variant="ghost" size="sm">
                <Link href={`/s/${storyboard.slug}/contents`}>Contents</Link>
              </Button>
            ) : null}
            {permissions.canSetVisibility ? (
              <Button asChild variant="ghost" size="sm">
                <Link href={`/s/${storyboard.slug}/settings`}>Settings</Link>
              </Button>
            ) : null}
            {/* FR-1.2 — the account wall sits in front of helping, not reading. */}
            {!signedIn ? (
              <Button asChild variant="primary" size="sm">
                <Link href={`/signin?next=/s/${storyboard.slug}`}>Sign in to help</Link>
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-10 px-6 py-10">
        {/* Contents rail */}
        <nav aria-label="Contents" className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-20">
            <p className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
              Contents
            </p>
            <ol className="mt-3 space-y-0.5">
              {chapters.map((entry, index) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    aria-current={entry.id === activeChapterId ? 'true' : undefined}
                    onClick={() => setActiveChapterId(entry.id)}
                    className={
                      entry.id === activeChapterId
                        ? 'w-full border-l-2 border-pencil bg-pencil-wash py-1.5 pl-3 text-left text-[13.5px] text-pencil'
                        : 'w-full border-l-2 border-transparent py-1.5 pl-3 text-left text-[13.5px] text-ink-soft hover:border-rule hover:text-ink'
                    }
                  >
                    <span className="block truncate">
                      {index + 1}. {entry.title}
                    </span>
                    <span className="mt-0.5 block text-[11.5px] text-ink-faint tabular-nums">
                      {entry.sections
                        .reduce((total, section) => total + section.wordCount, 0)
                        .toLocaleString('en-GB')}{' '}
                      words
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </nav>

        {/* Manuscript */}
        <main className="min-w-0 flex-1">
          <header className="mb-10">
            {storyboard.isSeed ? (
              // FR-15.3 — a seeded storyboard never looks like a real user's.
              <p className="mb-2 inline-block border border-ochre/40 bg-ochre-wash px-2 py-0.5 text-[11.5px] tracking-wide text-ochre uppercase">
                Example
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
            </p>
            {storyboard.logline ? (
              <p className="mt-4 max-w-measure font-manuscript text-[17px] leading-relaxed text-ink-soft italic">
                {storyboard.logline}
              </p>
            ) : null}
          </header>

          {/* FR-10.1 — reading an alternate is never a surprise. */}
          {!version.isMain ? (
            <p className="mb-8 max-w-measure border-l-2 border-ochre/50 bg-ochre-wash/40 py-1.5 pl-4 text-[12.5px] leading-relaxed text-ink-soft">
              You are reading {version.name}, an alternate version.{' '}
              <Link href={`/s/${storyboard.slug}`} className="text-pencil hover:underline">
                Read the main draft
              </Link>
              .
            </p>
          ) : null}

          {/* FR-10.4 to FR-10.6 — where this came from, and who took it on. */}
          <LineageBanner storyboardId={storyboard.id} slug={storyboard.slug} />

          {/* Decision 0007 — say so rather than letting history look incomplete. */}
          {historyVisibleFrom ? (
            <p className="mb-8 max-w-measure border-l-2 border-rule py-1 pl-4 text-[12.5px] leading-relaxed text-ink-faint">
              This storyboard was private until{' '}
              {historyVisibleFrom.toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
              . Versions written before then are visible to its authors only.
            </p>
          ) : null}

          {/* FR-14.1 — said once, at the top, and then got out of the way. */}
          {finished ? (
            <p className="mb-8 max-w-measure text-[12.5px] leading-relaxed text-ink-faint">
              Finished
              {storyboard.finishedAt
                ? ` ${storyboard.finishedAt.toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}`
                : ''}
              .
            </p>
          ) : null}

          {chapters.length === 0 ? (
            <p className="text-ink-soft">This storyboard has no chapters yet.</p>
          ) : (
            <article>
              <h2 className="font-manuscript text-[24px] font-medium text-ink">
                {chapters[activeIndex]?.title}
              </h2>

              {chapter.isPending ? (
                <p className="mt-6 text-[13.5px] text-ink-faint">Loading…</p>
              ) : (
                <div className="manuscript mt-6 max-w-measure">
                  {(chapter.data ?? []).map((section) => (
                    <section
                      key={section.id}
                      id={`section-${section.id}`}
                      className={
                        highlighted === section.id
                          ? 'relative -mx-4 rounded-control bg-pencil-wash/60 px-4 transition-colors'
                          : 'relative -mx-4 px-4 transition-colors'
                      }
                    >
                      {section.title ? (
                        <h3 className="font-manuscript text-[19px] font-medium">{section.title}</h3>
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
                      {/* FR-11.5 — the margin card, tied to its section by a
                          leader rule that thickens and turns blue on hover. */}
                      {(requestsBySection.get(section.id) ?? []).map((request) => (
                        <aside key={request.id} className="not-prose group relative mb-6">
                          {/* The leader rule: a hairline from the card to the
                              section it belongs to, which thickens and turns
                              blue pencil on hover (architecture section 9). */}
                          <span
                            aria-hidden
                            className={
                              highlighted === section.id
                                ? 'absolute -top-3 left-0 h-0.5 w-10 bg-pencil transition-all'
                                : 'absolute -top-3 left-0 h-px w-10 bg-rule transition-all group-hover:h-0.5 group-hover:bg-pencil'
                            }
                          />
                          <div className="border border-ochre/35 bg-ochre-wash shadow-lift transition-colors group-hover:border-ochre">
                            {/* FR-11.5 — the card itself scrolls and highlights;
                                opening the request is its own explicit action,
                                so neither is a surprise. */}
                            <button
                              type="button"
                              className="block w-full px-4 pt-3 pb-1 text-left"
                              aria-pressed={highlighted === section.id}
                              onClick={() => {
                                setHighlighted(section.id)
                                document
                                  .getElementById(`section-${section.id}`)
                                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                              }}
                            >
                              <span className="block text-[11.5px] tracking-wide text-ochre uppercase">
                                {request.kind === 'UNBLOCK'
                                  ? 'stuck — wants ideas'
                                  : request.kind === 'CONTINUE'
                                    ? 'stuck — needs writing'
                                    : 'stuck — needs a rewrite'}
                              </span>
                              <span className="mt-1 block font-manuscript text-[17px] text-ink">
                                {request.title}
                              </span>
                              <span className="mt-1 block text-[12px] text-ink-soft">
                                {request.kind === 'UNBLOCK'
                                  ? `${String(request._count.ideas)} ${request._count.ideas === 1 ? 'idea' : 'ideas'}`
                                  : `${String(request._count.suggestions)} ${request._count.suggestions === 1 ? 'suggestion' : 'suggestions'} · ${String(request.minWords)}–${String(request.maxWords)} words`}
                              </span>
                            </button>
                            <p className="px-4 pt-1 pb-3">
                              <Link
                                href={`/s/${storyboard.slug}/help/${request.publicId}`}
                                className="text-[12.5px] text-ochre underline-offset-2 hover:underline"
                              >
                                Read what they need →
                              </Link>
                            </p>
                          </div>
                        </aside>
                      ))}

                      {permissions.canEdit ? (
                        <p className="not-prose mb-8 text-[12.5px]">
                          <Link
                            href={`/s/${storyboard.slug}/c/${activeIndex + 1}/${section.order + 1}/edit${versionSuffix}`}
                            className="text-pencil hover:underline"
                          >
                            Edit
                          </Link>
                          {' · '}
                          <Link
                            href={`/s/${storyboard.slug}/c/${activeIndex + 1}/${section.order + 1}/history${versionSuffix}`}
                            className="text-ink-faint hover:text-ink hover:underline"
                          >
                            History
                          </Link>
                          {!finished &&
                          permissions.canOpenRequest &&
                          (requestsBySection.get(section.id) ?? []).length === 0 ? (
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
                  ))}
                </div>
              )}

              <nav className="mt-12 flex justify-between border-t border-rule pt-5">
                {activeIndex > 0 ? (
                  <button
                    type="button"
                    onClick={() => setActiveChapterId(chapters[activeIndex - 1]!.id)}
                    className="text-[13.5px] text-pencil hover:underline"
                  >
                    ← {chapters[activeIndex - 1]!.title}
                  </button>
                ) : (
                  <span />
                )}
                {activeIndex < chapters.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => setActiveChapterId(chapters[activeIndex + 1]!.id)}
                    className="text-[13.5px] text-pencil hover:underline"
                  >
                    {chapters[activeIndex + 1]!.title} →
                  </button>
                ) : (
                  <span />
                )}
              </nav>

              {/* FR-14.1 — the contributors, linked from the foot. On a
                  finished manuscript this is the last thing a reader sees,
                  which is the right place for it. */}
              {finished ? (
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
        </main>
      </div>
    </div>
  )
}
