import { TRPCError } from '@trpc/server'
import type { Metadata } from 'next'
import Link from '@/components/link'
import { notFound } from 'next/navigation'

import { ContributionCalendar } from '@/components/contribution-calendar'
import { CopyLink } from '@/components/copy-link'
import { UserAvatar } from '@/components/user-avatar'
import { STORY_TYPE_LABELS } from '@/lib/schemas/storyboard'
import { readTimeZone } from '@/lib/dates'
import { caller } from '@/trpc/server'

import { BlockButton } from '@/components/block-button'
import { ReportButton } from '@/components/report-button'

import { ContributionFeed } from './contribution-feed'
import { PassedWork } from './passed-work'

type Params = { params: Promise<{ username: string }> }

export const dynamic = 'force-dynamic'

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
  const timeZone = await readTimeZone()
  const { username } = await params
  const data = await load(username)
  const { user, counts, authored, credits, passed, calendar } = data
  const handle = user.username ?? username

  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-3xl px-6 py-12">
      <header>
        <div className="flex items-center gap-5">
          {/* Item 3.13 — the picture, or initials; the name is beside it. */}
          <UserAvatar person={user} size="xl" />
          <div className="min-w-0">
            <h1 className="font-manuscript text-[32px] leading-tight font-medium text-ink">
              {user.displayName ?? user.username}
            </h1>
            <p className="mt-1 text-[13.5px] text-ink-faint">
              @{user.username}
              {' · '}
              {/* Item 6.11 — the profile's address, to hand to someone. */}
              <CopyLink path={`/@${handle}`} />
            </p>
          </div>
        </div>
        {user.bio ? (
          <p className="mt-4 max-w-measure text-[14.5px] leading-relaxed text-ink-soft">
            {user.bio}
          </p>
        ) : null}
        {/* Item 6.10 — your own profile says where it is changed. */}
        {data.isSelf ? (
          <p className="mt-4 text-[13px] text-ink-faint">
            This is your profile as others see it.{' '}
            <Link href="/settings" className="text-pencil hover:underline">
              Edit your profile in Settings
            </Link>
          </p>
        ) : null}
        {user.suspended ? (
          <p className="mt-4 border-l-2 border-crimson bg-paper-sunk px-4 py-2.5 text-[13.5px] text-ink">
            Your account is suspended while a report is reviewed. Only you can see this. If you
            think that&rsquo;s wrong,{' '}
            <Link href="/contact" className="underline">
              write to a person
            </Link>
            .
          </p>
        ) : null}
      </header>

      {/* FR-9.3 — the four counts. */}
      <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-3 border-y border-rule py-4">
        {[
          { label: 'stories', value: counts.authored },
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
        <ContributionCalendar
          days={calendar}
          name={user.displayName ?? user.username ?? username}
          isSelf={data.isSelf}
        />
      </section>

      {authored.length > 0 ? (
        <section className="mt-12">
          <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
            Stories
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
                      {/* Item 6.17 — the same figure the story's pages give. */}
                      {storyboard.ownShare !== null
                        ? ` · ${String(storyboard.ownShare)}% the author’s own words`
                        : ''}
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

      {/* FR-9.3 — the feed of accepted work, with an excerpt and a link to where it reads. */}
      <section className="mt-12">
        <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
          Contributions
        </h2>
        <ContributionFeed
          username={handle}
          initial={{ items: credits, nextCursor: data.creditsCursor }}
          isSelf={data.isSelf}
          timeZone={timeZone}
        />
      </section>

      {/* FR-9.4 — collapsed, and private unless its author says otherwise. */}
      <PassedWork
        username={handle}
        initial={{ items: passed, nextCursor: data.passedCursor }}
        count={data.passedCount}
        isSelf={data.isSelf}
        isPublic={data.passedIsPublic}
        canToggle={data.canTogglePassed}
      />

      <section className="mt-12 flex flex-wrap items-baseline justify-between gap-4 border-t border-rule pt-6">
        <p className="text-[13px] text-ink-faint">
          <Link href={`/u/${handle}/credits`} className="text-pencil hover:underline">
            Credit lines for a manuscript&rsquo;s front matter
          </Link>
        </p>
        {/* FR-13.5 — quiet, and only on somebody else's profile. */}
        {!data.isSelf ? (
          <div className="flex flex-wrap items-center gap-4">
            <ReportButton targetType="USER" targetId={user.id} />
            {/* Decision 0046 (item 2.9) — and the one tool before a report. */}
            {data.canBlock ? (
              <BlockButton
                userId={user.id}
                name={user.displayName ?? user.username ?? 'this person'}
                blocked={data.blockedByMe}
              />
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  )
}
