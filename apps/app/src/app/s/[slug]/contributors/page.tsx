import { TRPCError } from '@trpc/server'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { caller } from '@/trpc/server'

type Params = { params: Promise<{ slug: string }> }

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Contributors' }

const TYPE_LABELS = {
  PROSE: 'wrote a passage',
  IDEA: 'an idea that helped',
  COAUTHOR: 'co-author',
} as const

/** Screen 14 — everyone who helped, with what and when (FR-9.2). */
export default async function ContributorsPage({ params }: Params) {
  const { slug } = await params

  let storyboard
  try {
    storyboard = await caller.storyboard.get({ slug })
  } catch (error) {
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound()
    throw error
  }

  const { credits, contributors } = await caller.credit.forStoryboard({
    storyboardId: storyboard.storyboard.id,
  })

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
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
          Nobody has contributed to this storyboard yet. When someone&rsquo;s suggestion is
          accepted, or an idea of theirs helps, they appear here permanently.
        </p>
      ) : (
        <>
          <p className="mt-3 text-[14.5px] leading-relaxed text-ink-soft">
            {contributors.length} {contributors.length === 1 ? 'writer has' : 'writers have'}{' '}
            contributed to {storyboard.storyboard.title}.
          </p>

          <ul className="mt-8 divide-y divide-rule border-y border-rule">
            {credits.map((credit) => (
              <li key={credit.id} className="flex items-baseline justify-between gap-4 py-3.5">
                <div className="min-w-0">
                  <p className="text-[14.5px] text-ink">
                    {credit.contributor.username ? (
                      <Link
                        href={`/@${credit.contributor.username}`}
                        className="text-pencil hover:underline"
                      >
                        {credit.contributor.displayName ?? credit.contributor.username}
                      </Link>
                    ) : (
                      (credit.contributor.displayName ?? 'a writer')
                    )}
                    <span className="text-ink-faint"> — {TYPE_LABELS[credit.type]}</span>
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
                  {credit.createdAt.toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </time>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  )
}
