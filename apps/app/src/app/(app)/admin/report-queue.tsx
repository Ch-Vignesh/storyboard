'use client'

import { Button } from '@storyboard/ui/components/button'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'

import { REPORT_CATEGORIES } from '@/lib/schemas/report'
import { useTRPC } from '@/trpc/client'

import { FlagsPanel } from './flags-panel'
import { SeededPanel } from './seeded-panel'

const CATEGORY_LABELS = Object.fromEntries(
  REPORT_CATEGORIES.map((category) => [category.value, category.label]),
)

const TABS = [
  { state: 'OPEN' as const, label: 'Open' },
  { state: 'UPHELD' as const, label: 'Upheld' },
  { state: 'DISMISSED' as const, label: 'Dismissed' },
]

/**
 * FR-13.7 — the queue, with one decision per row.
 *
 * Two buttons and nothing to type. The moderator is one person doing this in
 * the evening, and every field they have to fill in is a report they do not
 * get to. Both decisions are reversible, which is what makes deciding quickly
 * a reasonable thing to ask of them.
 */
export function ReportQueue() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [state, setState] = useState<'OPEN' | 'UPHELD' | 'DISMISSED'>('OPEN')

  const options = trpc.admin.reports.queryOptions({ state })
  const { data, isPending } = useQuery(options)

  const decide = useMutation(
    trpc.admin.decide.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.admin.reports.queryKey() })
      },
    }),
  )

  return (
    <>
      <section className="mt-9">
        <div className="flex items-center gap-1 border-b border-rule">
          {TABS.map((tab) => (
            <button
              key={tab.state}
              type="button"
              onClick={() => setState(tab.state)}
              aria-pressed={state === tab.state}
              className={
                state === tab.state
                  ? '-mb-px border-b-2 border-pencil px-3 py-2 text-[13.5px] text-ink'
                  : '-mb-px border-b-2 border-transparent px-3 py-2 text-[13.5px] text-ink-faint hover:text-ink'
              }
            >
              {tab.label}
              {data?.counts[tab.state] !== undefined ? (
                <span className="ml-1.5 tabular-nums">{data.counts[tab.state]}</span>
              ) : null}
            </button>
          ))}
        </div>

        {isPending ? (
          <p className="mt-6 text-[13.5px] text-ink-faint">Reading the queue…</p>
        ) : (data?.reports.length ?? 0) === 0 ? (
          <p className="mt-6 text-[14px] text-ink-soft">
            {state === 'OPEN' ? 'Nothing waiting. ' : 'Nothing here. '}
            {state === 'OPEN' ? 'That is the state this should usually be in.' : null}
          </p>
        ) : (
          <ul className="divide-y divide-rule">
            {data?.reports.map((report) => (
              <li key={report.id} className="py-4">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="min-w-0 text-[14.5px] text-ink">
                    <span className="border border-ochre/40 bg-ochre-wash px-1.5 py-0.5 text-[11.5px] tracking-wide text-ochre uppercase">
                      {CATEGORY_LABELS[report.category] ?? report.category}
                    </span>{' '}
                    {report.subject.href ? (
                      <Link href={report.subject.href} className="text-pencil hover:underline">
                        {report.subject.label}
                      </Link>
                    ) : (
                      <span>{report.subject.label}</span>
                    )}
                    <span className="text-ink-faint"> · {report.targetType.toLowerCase()}</span>
                  </p>
                  <time
                    dateTime={report.createdAt.toISOString()}
                    className="shrink-0 text-[12.5px] text-ink-faint tabular-nums"
                  >
                    {report.createdAt.toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </time>
                </div>

                {report.subject.excerpt ? (
                  <p className="mt-1.5 max-w-measure border-l-2 border-rule pl-3 font-manuscript text-[14px] leading-relaxed text-ink-soft">
                    {report.subject.excerpt}
                  </p>
                ) : null}

                {report.note ? (
                  <p className="mt-1.5 max-w-measure text-[13px] leading-relaxed text-ink-soft">
                    <span className="text-ink-faint">Reporter said:</span> {report.note}
                  </p>
                ) : null}

                <p className="mt-1.5 text-[12px] text-ink-faint">
                  Reported by {report.reporterName}
                  {report.resolvedAt
                    ? ` · ${report.state.toLowerCase()} ${report.resolvedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                    : ''}
                </p>

                <div className="mt-2.5 flex items-center gap-2">
                  {report.state === 'OPEN' ? (
                    <>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={decide.isPending}
                        onClick={() => decide.mutate({ reportId: report.id, decision: 'UPHELD' })}
                      >
                        Uphold
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={decide.isPending}
                        onClick={() =>
                          decide.mutate({ reportId: report.id, decision: 'DISMISSED' })
                        }
                      >
                        Dismiss
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={decide.isPending}
                      onClick={() => decide.mutate({ reportId: report.id, decision: 'OPEN' })}
                    >
                      Put it back in the queue
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {decide.data?.suspended ? (
          <p
            role="status"
            className="mt-4 border-l-2 border-crimson bg-paper-sunk py-2 pl-4 text-[13.5px] text-ink"
          >
            That was the tenth upheld report against this account, so it is suspended pending
            review. Their writing stays where it is.
          </p>
        ) : null}
      </section>

      <SeededPanel />
      <FlagsPanel />
    </>
  )
}
