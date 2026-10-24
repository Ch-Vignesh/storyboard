import { TRPCError } from '@trpc/server'
import type { Metadata } from 'next'
import Link from '@/components/link'

import { ownShareSentence } from '@/lib/own-share'
import { notFound } from 'next/navigation'

import { ReportButton } from '@/components/report-button'
import { env } from '@/env'
import { UserAvatar } from '@/components/user-avatar'
import { hasProfile, nameOf } from '@/lib/people'
import { readTimeZone } from '@/lib/dates'
import { contributorsMetadata, orNotFound } from '@/lib/metadata'
import { formatInZone } from '@/lib/time-zone'
import { caller } from '@/trpc/server'

import { CreditLines, type CreditLine } from './credit-lines'

type Params = { params: Promise<{ slug: string }> }

export const dynamic = 'force-dynamic'

// Item 9.6 — named for its story, read as this person reads the page.
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params
  return orNotFound(contributorsMetadata(caller, slug))
}

const TYPE_LABELS = {
  PROSE: 'wrote a passage',
  IDEA: 'an idea that helped',
  COAUTHOR: 'co-author',
} as const

type Credit = Awaited<ReturnType<typeof caller.credit.forStoryboard>>['credits'][number]

/** One line of the list: who, what, when. Erased people keep their line. */
async function CreditRow({ credit }: { credit: Credit }) {
  const timeZone = await readTimeZone()
  return (
    <li className="flex items-baseline justify-between gap-4 py-3.5">
      <div className="min-w-0">
        <p className="text-[14.5px] text-ink">
          <UserAvatar person={credit.contributor} size="sm" className="mr-2 align-middle" />
          {hasProfile(credit.contributor) ? (
            <Link href={`/@${credit.contributor.username}`} className="text-pencil hover:underline">
              {nameOf(credit.contributor)}
            </Link>
          ) : (
            // Decision 0013 — erased, but still counted. The row stays
            // so an author's history gains no silent gap.
            <span className="text-ink-soft italic">{nameOf(credit.contributor)}</span>
          )}
          <span className="text-ink-faint"> — {TYPE_LABELS[credit.type]}</span>
          {/* Item 6.10 — where it reads now, counted as the reader counts (FR-9.2). */}
          {credit.place ? (
            <span className="text-ink-faint">
              {' · '}
              <Link href={credit.place.path} className="hover:text-ink hover:underline">
                chapter {credit.place.chapterNumber}, section {credit.place.sectionNumber}
              </Link>
            </span>
          ) : null}
        </p>
        {/* FR-8.5 / principle 1.3.3 — the record survives the text. */}
        {!credit.isLive ? (
          <p className="mt-0.5 text-[12.5px] text-ink-faint">
            This writing is no longer in the main draft. The contribution stands.
          </p>
        ) : null}
      </div>
      <time
        dateTime={credit.createdAt.toISOString()}
        className="shrink-0 text-[12.5px] text-ink-faint tabular-nums"
      >
        {formatInZone(credit.createdAt, 'short', timeZone)}
      </time>
    </li>
  )
}

/** Screen 14 — everyone who helped, with what and when (FR-9.2, FR-9.5). */
export default async function ContributorsPage({ params }: Params) {
  const timeZone = await readTimeZone()
  const { slug } = await params

  let storyboard
  try {
    storyboard = await caller.storyboard.get({ slug })
  } catch (error) {
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound()
    throw error
  }

  const [{ credits, contributors, ownShare }, lineage] = await Promise.all([
    caller.credit.forStoryboard({ storyboardId: storyboard.storyboard.id }),
    caller.spinOff.lineage({ storyboardId: storyboard.storyboard.id }),
  ])

  // FR-9.5 — what came with the spin-off, above what has been earned since.
  const inherited = credits.filter((credit) => credit.inheritedFromId !== null)
  const earned = credits.filter((credit) => credit.inheritedFromId === null)
  const origin = lineage.ancestors[0]

  /*
   * FR-9.6 — name, role, chapter, date and the permanent URL, in that order.
   * Built here rather than in the client component so the addresses are
   * absolute: a line pasted into a manuscript is read by somebody who has never
   * been to this site, and a relative path means nothing to them.
   */
  const creditLines: CreditLine[] = credits.map((credit) => ({
    name: nameOf(credit.contributor),
    role: TYPE_LABELS[credit.type],
    chapter: credit.place?.chapter ?? null,
    date: formatInZone(credit.createdAt, 'long', timeZone),
    url: credit.place ? `${env.NEXT_PUBLIC_APP_URL}${credit.place.path}` : null,
  }))

  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-2xl px-6 py-12">
      <nav className="mb-6 text-[12.5px] text-ink-faint">
        <Link href={`/s/${slug}`} className="hover:text-ink hover:underline">
          {storyboard.storyboard.title}
        </Link>
      </nav>

      <h1 className="font-manuscript text-[28px] leading-tight font-medium text-ink">
        Everyone who helped
      </h1>

      {credits.length === 0 ? (
        <p className="mt-6 text-[14.5px] leading-relaxed text-ink-soft">
          Nobody has contributed to this story yet. When someone&rsquo;s suggestion is accepted, or
          an idea of theirs helps, they appear here permanently.
        </p>
      ) : (
        <>
          <p className="mt-3 text-[14.5px] leading-relaxed text-ink-soft">
            {contributors.length} {contributors.length === 1 ? 'writer has' : 'writers have'}{' '}
            contributed to {storyboard.storyboard.title}.
            {/* Item 6.17 (decision 0041) — and how much of it is the author's own. */}
            {ownShareSentence(ownShare) ? ` ${ownShareSentence(ownShare) ?? ''}.` : ''}
          </p>

          {/* FR-9.5 — a spin-off names the storyboard it came from, and its author. */}
          {inherited.length > 0 && origin ? (
            <section className="mt-9">
              <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
                Inherited from{' '}
                {origin.hidden || !origin.slug ? (
                  <span className="normal-case italic">{origin.title}</span>
                ) : (
                  <>
                    <Link
                      href={`/s/${origin.slug}`}
                      className="text-pencil normal-case hover:underline"
                    >
                      {origin.title}
                    </Link>{' '}
                    by {nameOf(origin.owner)}
                  </>
                )}
              </h2>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-faint">
                These people wrote before this story was spun off
                {origin.forkedAt ? ` on ${formatInZone(origin.forkedAt, 'long', timeZone)}` : ''}.
                Their credit came with it and cannot be removed here.
              </p>
              <ul className="mt-4 divide-y divide-rule border-y border-rule">
                {inherited.map((credit) => (
                  <CreditRow key={credit.id} credit={credit} />
                ))}
              </ul>
            </section>
          ) : null}

          <section className={inherited.length > 0 && origin ? 'mt-10' : 'mt-8'}>
            {inherited.length > 0 && origin ? (
              <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
                Since then
              </h2>
            ) : null}

            {earned.length === 0 ? (
              <p className="mt-2 text-[13px] leading-relaxed text-ink-faint">
                Nobody has contributed to this version yet.
              </p>
            ) : (
              <ul
                className={`divide-y divide-rule border-y border-rule ${
                  inherited.length > 0 && origin ? 'mt-4' : ''
                }`}
              >
                {earned.map((credit) => (
                  <CreditRow key={credit.id} credit={credit} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {/* FR-9.6 — the same list as plain text, for a book's front matter. */}
      <CreditLines title={storyboard.storyboard.title} lines={creditLines} />

      {/* FR-13.5 — reporting the storyboard itself, not a person on this list. */}
      <section className="mt-12 border-t border-rule pt-6">
        <ReportButton targetType="STORYBOARD" targetId={storyboard.storyboard.id} />
      </section>
    </main>
  )
}
