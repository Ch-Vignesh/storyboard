import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { caller } from '@/trpc/server'

type Params = { params: Promise<{ username: string }> }

export const dynamic = 'force-dynamic'

const TYPE_LABELS = {
  PROSE: 'wrote a passage',
  IDEA: 'an idea that helped',
  COAUTHOR: 'co-author',
} as const

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { username } = await params
  return { title: `@${username}` }
}

/**
 * Screen 13, the part of it phase 2 can honestly show: who this is and what
 * they have been credited for (FR-9.1, FR-9.2).
 *
 * FR-9.3's full profile — the contribution calendar, the counts across
 * storyboards, and FR-9.4's collapsed "written but not used" section — belongs
 * to phase 3. This exists now because phase 2 puts credit lines on the
 * contributors page and in the reader, and a credit that links nowhere is worse
 * than no link.
 */
export default async function ProfilePage({ params }: Params) {
  const { username } = await params
  const data = await caller.credit.forUser({ username })
  if (!data) notFound()

  const { user, credits } = data

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="font-manuscript text-[30px] leading-tight font-medium text-ink">
        {user.displayName ?? user.username}
      </h1>
      <p className="mt-1 text-[13.5px] text-ink-faint">@{user.username}</p>
      {user.bio ? (
        <p className="mt-4 max-w-measure text-[14.5px] leading-relaxed text-ink-soft">{user.bio}</p>
      ) : null}

      <section className="mt-10">
        <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
          Contributions
        </h2>

        {credits.length === 0 ? (
          <p className="mt-4 text-[14px] text-ink-soft">
            Nothing yet. Contributions appear here when an author accepts a suggestion, or marks an
            idea as having helped.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-rule border-y border-rule">
            {credits.map((credit) => (
              <li key={credit.id} className="flex items-baseline justify-between gap-4 py-3.5">
                <p className="min-w-0 text-[14.5px] text-ink">
                  <Link
                    href={`/s/${credit.storyboard.slug}`}
                    className="text-pencil hover:underline"
                  >
                    {credit.storyboard.title}
                  </Link>
                  <span className="text-ink-faint"> — {TYPE_LABELS[credit.type]}</span>
                  {/* Principle 1.3.3 — the record outlives the text. */}
                  {!credit.isLive ? (
                    <span className="block text-[12.5px] text-ink-faint">
                      No longer in the main draft. The contribution stands.
                    </span>
                  ) : null}
                </p>
                <time
                  dateTime={credit.createdAt.toISOString()}
                  className="shrink-0 text-[12.5px] text-ink-faint tabular-nums"
                >
                  {credit.createdAt.toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
