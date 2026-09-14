import { TRPCError } from '@trpc/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ContributionCalendar } from '@/components/contribution-calendar'
import { STORY_TYPE_LABELS } from '@/lib/schemas/storyboard'
import { caller } from '@/trpc/server'

import { PassedWork } from './passed-work'

type Params = { params: Promise<{ username: string }> }

export const dynamic = 'force-dynamic'

const TYPE_LABELS = {
  PROSE: 'wrote a passage',
  IDEA: 'an idea that helped',
  COAUTHOR: 'co-author',
} as const

async function load(username: string) {
  try {
    return await caller.profile.byUsername({ username })
  } catch (error) {
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound()
    throw error
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { username } = await params
  const data = await load(username)
  return {
    title: data.user.displayName ?? `@${data.user.username ?? username}`,
    description: data.user.bio ?? undefined,
  }
}

/**
 * Screen 13 — FR-9.3.
 *
 * One public identity (decision 0011): the username owns this URL and never
 * changes; the display name is what is shown.
 */
export default async function ProfilePage({ params }: Params) {
  const { username } = await params
  const data = await load(username)
  const { user, counts, authored, credits, passed, calendar } = data

  const excerptOf = (text: string | null | undefined) =>
    text && text.length > 160 ? `${text.slice(0, 160).trimEnd()}…` : text

  return (
    <main id="main" className="mx-auto max-w-3xl px-6 py-12">
      <header>
        <h1 className="font-manuscript text-[32px] leading-tight font-medium text-ink">
          {user.displayName ?? user.username}
        </h1>
        <p className="mt-1 text-[13.5px] text-ink-faint">@{user.username}</p>
        {user.bio ? (
          <p className="mt-4 max-w-measure text-[14.5px] leading-relaxed text-ink-soft">
            {user.bio}
          </p>
        ) : null}
        {user.suspended ? (
          <p className="mt-4 border-l-2 border-crimson bg-paper-sunk px-4 py-2.5 text-[13.5px] text-ink">
            This account is suspended while a report is reviewed.
          </p>
        ) : null}
      </header>

      {/* FR-9.3 — the four counts. */}
      <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-3 border-y border-rule py-4">
        {[
          { label: 'storyboards', value: counts.authored },
          { label: 'contributions accepted', value: counts.prose },
          { label: 'ideas that helped', value: counts.ideas },
          { label: 'spin-offs', value: counts.spinOffs },
        ].map((entry) => (
          <div key={entry.label}>
            <dd className="font-manuscript text-[26px] leading-none text-ink tabular-nums">
              {entry.value}
            </dd>
            <dt className="mt-1 text-[12px] tracking-wide text-ink-faint uppercase">
              {entry.label}
            </dt>
          </div>
        ))}
      </dl>

      <section className="mt-10">
        <ContributionCalendar days={calendar} />
      </section>

      {authored.length > 0 ? (
        <section className="mt-12">
          <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
            Storyboards
          </h2>
          <ul className="mt-4 divide-y divide-rule border-y border-rule">
            {authored.map((storyboard) => (
              <li key={storyboard.id}>
                <Link
                  href={`/s/${storyboard.slug}`}
                  className="flex items-baseline justify-between gap-6 py-3.5 hover:bg-paper-sunk"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-manuscript text-[19px] text-ink">
                      {storyboard.title}
                      {storyboard.isSeed ? (
                        <span className="ml-2 border border-ochre/40 px-1 text-[10.5px] tracking-wide text-ochre uppercase">
                          example
                        </span>
                      ) : null}
                    </span>
                    {storyboard.logline ? (
                      <span className="mt-0.5 block truncate text-[13px] text-ink-soft">
                        {storyboard.logline}
                      </span>
                    ) : null}
                    <span className="mt-0.5 block text-[12.5px] text-ink-faint">
                      {STORY_TYPE_LABELS[storyboard.type]}
                    </span>
                  </span>
                  {storyboard.requests.length > 0 ? (
                    // FR-11.4 — the open-requests badge is the call to action.
                    <span className="shrink-0 border border-ochre/40 bg-ochre-wash px-2 py-1 text-[12px] text-ochre">
                      {storyboard.requests.length} open for help
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* FR-9.3 — the feed of accepted work, with an excerpt and a link. */}
      <section className="mt-12">
        <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
          Contributions
        </h2>
        {credits.length === 0 ? (
          <p className="mt-4 text-[14px] leading-relaxed text-ink-soft">
            Nothing yet. Contributions appear here when an author accepts a suggestion, or marks an
            idea as having helped.
          </p>
        ) : (
          <ul className="mt-4 space-y-5">
            {credits.map((credit) => (
              <li key={credit.id} className="border-l-2 border-rule py-1 pl-4">
                <p className="text-[13px] text-ink-faint">
                  <Link
                    href={`/s/${credit.storyboard.slug}`}
                    className="text-pencil hover:underline"
                  >
                    {credit.storyboard.title}
                  </Link>
                  {' · '}
                  {TYPE_LABELS[credit.type]}
                  {' · '}
                  <time dateTime={credit.createdAt.toISOString()}>
                    {credit.createdAt.toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </time>
                </p>
                {credit.suggestion?.contentText || credit.idea?.body ? (
                  <p className="mt-1.5 max-w-measure font-manuscript text-[15px] leading-relaxed text-ink">
                    {excerptOf(credit.suggestion?.contentText ?? credit.idea?.body)}
                  </p>
                ) : null}
                {/* Principle 1.3.3 — the record outlives the text. */}
                {!credit.isLive ? (
                  <p className="mt-1.5 text-[12.5px] text-ink-faint">
                    This writing is no longer in the main draft. The contribution stands.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* FR-9.4 — collapsed, and private unless its author says otherwise. */}
      <PassedWork
        passed={passed}
        isSelf={data.isSelf}
        isPublic={data.passedIsPublic}
        canToggle={data.canTogglePassed}
      />

      <section className="mt-12 border-t border-rule pt-6">
        <p className="text-[13px] text-ink-faint">
          <Link
            href={`/u/${user.username ?? username}/credits`}
            className="text-pencil hover:underline"
          >
            Credit lines for a manuscript&rsquo;s front matter
          </Link>
        </p>
      </section>
    </main>
  )
}
