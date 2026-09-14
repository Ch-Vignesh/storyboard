'use client'

import type { SuggestionState } from '@storyboard/db'
import { useSuspenseQuery } from '@tanstack/react-query'
import Link from 'next/link'

import { PASS_CHIPS } from '@/lib/schemas/help'
import { useTRPC } from '@/trpc/client'

/**
 * FR-11.1 region two: requests you have helped with that have news.
 *
 * Only decisions and movement appear here. A request you sent something to that
 * has simply gone quiet is not news — listing it would turn this region into a
 * tally of things to feel bad about, which is the opposite of what principle
 * 1.3.4 ("the author is never cornered") implies for the helper's side too.
 */
export function NewsRegion() {
  const trpc = useTRPC()
  const { data } = useSuspenseQuery(trpc.request.withNews.queryOptions())

  const items = [
    ...data.suggestions.map((suggestion) => ({
      key: `s-${suggestion.id}`,
      at: suggestion.decidedAt ?? suggestion.submittedAt ?? new Date(0),
      href: `/s/${suggestion.request.storyboard.slug}/help/${suggestion.request.publicId}/s/${suggestion.publicId}`,
      title: suggestion.request.title,
      storyboard: suggestion.request.storyboard.title,
      state: suggestion.state,
      reason: suggestion.passReason,
    })),
    ...data.ideas.map((idea) => ({
      key: `i-${idea.id}`,
      at: idea.createdAt,
      href: `/s/${idea.request.storyboard.slug}/help/${idea.request.publicId}`,
      title: idea.request.title,
      storyboard: idea.request.storyboard.title,
      state: 'IDEA_HELPED' as const,
      reason: null,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime())

  if (items.length === 0) return null

  return (
    <section className="mt-12">
      <h2 className="text-[13px] font-medium tracking-wide text-ink-faint uppercase">
        Work you have helped with
      </h2>

      <ul className="mt-4 divide-y divide-rule border-y border-rule">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              className="flex items-baseline justify-between gap-4 py-3.5 hover:bg-paper-sunk"
            >
              <span className="min-w-0">
                <span className="block truncate text-[14.5px] text-ink">{item.title}</span>
                <span className="mt-0.5 block text-[12.5px] text-ink-faint">
                  {item.storyboard}
                  {item.state === 'PASSED' && item.reason
                    ? ` · ${PASS_CHIPS.find((chip) => chip.value === item.reason)?.label ?? ''}`
                    : ''}
                </span>
              </span>
              <Outcome state={item.state} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * The outcome, in the product's own words rather than a state name.
 *
 * Total over every suggestion state, not only the three the query asks for. If
 * that query ever widens, this renders something honest rather than crashing on
 * a missing key.
 */
function Outcome({ state }: { state: SuggestionState | 'IDEA_HELPED' }) {
  const styles: Record<SuggestionState | 'IDEA_HELPED', { tone: string; label: string }> = {
    ACCEPTED: { tone: 'border-moss/40 bg-moss-wash text-moss', label: 'accepted' },
    IDEA_HELPED: { tone: 'border-moss/40 bg-moss-wash text-moss', label: 'your idea helped' },
    STALE: { tone: 'border-ochre/40 bg-ochre-wash text-ochre', label: 'needs updating' },
    PASSED: { tone: 'border-rule bg-paper-sunk text-ink-faint', label: 'went a different way' },
    SUBMITTED: { tone: 'border-pencil/30 bg-pencil-wash text-pencil', label: 'waiting' },
    WITHDRAWN: { tone: 'border-rule bg-paper-sunk text-ink-faint', label: 'withdrawn' },
    DRAFT: { tone: 'border-rule bg-paper-sunk text-ink-faint', label: 'draft' },
  }

  return (
    <span className={`shrink-0 border px-1.5 py-0.5 text-[11.5px] ${styles[state].tone}`}>
      {styles[state].label}
    </span>
  )
}
