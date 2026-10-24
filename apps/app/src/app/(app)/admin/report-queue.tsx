'use client'

import { Button } from '@storyboard/ui/components/button'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Link from '@/components/link'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

import { REPORT_QUEUE_PAGE } from '@/lib/schemas/constants'
import { REPORT_CATEGORIES, type ReportTarget } from '@/lib/schemas/report'
import { useTRPC } from '@/trpc/client'

const CATEGORY_LABELS = Object.fromEntries(
  REPORT_CATEGORIES.map((category) => [category.value, category.label]),
)

const TABS = [
  { state: 'OPEN' as const, label: 'Open' },
  { state: 'UPHELD' as const, label: 'Upheld' },
  { state: 'DISMISSED' as const, label: 'Dismissed' },
]

/** A report's subject as something that can be hidden (item 2.7): never a person. */
function hideable(report: {
  targetType: ReportTarget
  targetId: string
}): { targetType: Exclude<ReportTarget, 'USER'>; targetId: string } | null {
  if (report.targetType === 'USER') return null
  return { targetType: report.targetType, targetId: report.targetId }
}

/** Typing somewhere: a key pressed there is a letter, never a decision. */
function typing(target: EventTarget): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
}

/**
 * FR-13.7 — the queue, with one decision per row.
 *
 * Two buttons and nothing to type. The moderator is one person doing this in
 * the evening, and every field they have to fill in is a report they do not
 * get to. Both decisions are reversible, which is what makes deciding quickly
 * a reasonable thing to ask of them.
 *
 * Phase 14, item 9.3 — and one key each. With a report in focus (click it, or
 * tab to it): j and k move, u upholds, h upholds and hides (item 2.7), d
 * dismisses, o opens what was reported in a new tab. The keys belong to the
 * list, so they act only while focus is in it and never while it is in a
 * field: single-letter shortcuts that worked anywhere on the page would fire
 * from speech input and from a screen reader's own letter keys (WCAG 2.1.4,
 * NFR-4). The rows are one tab stop, moved by j and k. After a decision the
 * focus stays where the decided row was, which is now the next report: the
 * queue is worked from top to bottom without the mouse.
 *
 * Fifty at a time (`REPORT_QUEUE_PAGE`); "Show more" fetches the next by
 * cursor.
 */
export function ReportQueue() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [state, setState] = useState<'OPEN' | 'UPHELD' | 'DISMISSED'>('OPEN')
  const [active, setActive] = useState(0)
  const [said, setSaid] = useState<string | null>(null)
  const rows = useRef(new Map<string, HTMLLIElement>())
  /** Set by a key; the next list to arrive puts focus back on the active row. */
  const refocus = useRef(false)

  const list = useInfiniteQuery(
    trpc.admin.reports.infiniteQueryOptions(
      { state },
      { getNextPageParam: (page) => page.nextCursor },
    ),
  )
  const reports = list.data?.pages.flatMap((page) => page.reports) ?? []
  const counts = list.data?.pages[0]?.counts
  const current = Math.min(active, Math.max(reports.length - 1, 0))
  // What "Show more" will bring: the rest of this tab, a page at most.
  const remaining = (counts?.[state] ?? 0) - reports.length
  const more = remaining > 0 ? Math.min(REPORT_QUEUE_PAGE, remaining) : REPORT_QUEUE_PAGE

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: trpc.admin.reports.infiniteQueryKey() })
  }
  const decide = useMutation(trpc.admin.decide.mutationOptions({ onSuccess: refresh }))
  // Item 2.7 (decision 0045) — hide what a report was about, or show it again.
  const setHidden = useMutation(trpc.admin.setHidden.mutationOptions({ onSuccess: refresh }))
  const busy = decide.isPending || setHidden.isPending

  const rowAt = (index: number) => {
    const report = reports[index]
    return report ? rows.current.get(report.id) : undefined
  }

  useEffect(() => {
    if (!refocus.current) return
    refocus.current = false
    rowAt(current)?.focus()
    // `reports` arriving is the moment; the row it focuses is read from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.data])

  type Report = (typeof reports)[number]

  // A refused decision leaves the list as it was, and the focus where it is.
  const stay = () => {
    refocus.current = false
  }

  function uphold(report: Report, hide = false) {
    setSaid(null)
    decide.mutate(
      { reportId: report.id, decision: 'UPHELD', hide },
      {
        onSuccess: () =>
          setSaid(`${hide ? 'Upheld and hidden' : 'Upheld'}: ${report.subject.label}`),
        onError: stay,
      },
    )
  }

  function dismiss(report: Report) {
    setSaid(null)
    decide.mutate(
      { reportId: report.id, decision: 'DISMISSED' },
      { onSuccess: () => setSaid(`Dismissed: ${report.subject.label}`), onError: stay },
    )
  }

  function onKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
    if (typing(event.target)) return
    const report = reports[current]
    if (!report) return

    const move = (to: number) => {
      const index = Math.min(Math.max(to, 0), reports.length - 1)
      setActive(index)
      rowAt(index)?.focus()
    }
    const open = report.state === 'OPEN' && !busy && !event.repeat

    switch (event.key) {
      case 'j':
        move(current + 1)
        break
      case 'k':
        move(current - 1)
        break
      case 'u':
        if (!open) return
        refocus.current = true
        uphold(report)
        break
      case 'h':
        if (!open || report.targetType === 'USER' || report.subject.hidden) return
        refocus.current = true
        uphold(report, true)
        break
      case 'd':
        if (!open) return
        refocus.current = true
        dismiss(report)
        break
      case 'o':
        if (!report.subject.href || event.repeat) return
        window.open(report.subject.href, '_blank', 'noopener')
        break
      default:
        return
    }
    event.preventDefault()
  }

  return (
    <>
      <section className="mt-9">
        <div className="flex items-center gap-1 border-b border-rule">
          {TABS.map((tab) => (
            <button
              key={tab.state}
              type="button"
              onClick={() => {
                setState(tab.state)
                setActive(0)
                setSaid(null)
              }}
              aria-pressed={state === tab.state}
              className={
                state === tab.state
                  ? '-mb-px border-b-2 border-pencil px-3 py-2 text-[13.5px] text-ink'
                  : '-mb-px border-b-2 border-transparent px-3 py-2 text-[13.5px] text-ink-faint hover:text-ink'
              }
            >
              {tab.label}
              {counts?.[tab.state] !== undefined ? (
                <span className="ml-1.5 tabular-nums">{counts[tab.state]}</span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Item 9.3 — the keys, where they are used, in the words they act in. */}
        <p id="queue-keys" className="mt-3 text-[12.5px] leading-relaxed text-ink-faint">
          With a report in focus (click it, or tab to it): <Key>j</Key> and <Key>k</Key> move
          between reports · <Key>u</Key> upholds · <Key>h</Key> upholds and hides · <Key>d</Key>{' '}
          dismisses · <Key>o</Key> opens what was reported in a new tab.
        </p>

        {said ? (
          <p role="status" className="mt-3 text-[13px] text-ink-soft">
            {said}
          </p>
        ) : null}

        {list.isPending ? (
          <p className="mt-6 text-[13.5px] text-ink-faint">Reading the queue…</p>
        ) : list.isError ? (
          <p role="alert" className="mt-6 text-[13.5px] text-crimson">
            The queue did not arrive. Reload the page to try again.
          </p>
        ) : reports.length === 0 ? (
          <p className="mt-6 text-[14px] text-ink-soft">
            {state === 'OPEN' ? 'Nothing waiting. ' : 'Nothing here. '}
            {state === 'OPEN' ? 'That is the state this should usually be in.' : null}
          </p>
        ) : (
          <ul
            aria-label="Reports"
            aria-describedby="queue-keys"
            className="divide-y divide-rule"
            onKeyDown={onKeyDown}
          >
            {reports.map((report, index) => (
              <li
                key={report.id}
                ref={(row) => {
                  if (row) rows.current.set(report.id, row)
                  else rows.current.delete(report.id)
                }}
                // One tab stop for the whole list, on the active row (j and k
                // move it); focusing anything in a row makes that row active.
                tabIndex={index === current ? 0 : -1}
                aria-current={index === current ? 'true' : undefined}
                onFocus={() => setActive(index)}
                className="-mx-3 border-l-2 border-transparent px-3 py-4 outline-offset-2 aria-[current=true]:border-pencil"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <p className="min-w-0 text-[14.5px] text-ink">
                    <span className="border border-ochre/40 bg-ochre-wash px-1.5 py-0.5 text-[11.5px] tracking-wide text-ochre uppercase">
                      {CATEGORY_LABELS[report.category] ?? report.category}
                    </span>{' '}
                    {report.subject.href ? (
                      <Link
                        href={report.subject.href}
                        aria-keyshortcuts="o"
                        className="text-pencil hover:underline"
                      >
                        {report.subject.label}
                      </Link>
                    ) : (
                      <span>{report.subject.label}</span>
                    )}
                    <span className="text-ink-faint"> · {report.targetType.toLowerCase()}</span>
                    {report.subject.hidden ? (
                      <span className="ml-1.5 border border-rule px-1.5 py-0.5 text-[11px] tracking-wide text-ink-faint uppercase">
                        hidden
                      </span>
                    ) : null}
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
                        disabled={busy}
                        aria-keyshortcuts="u"
                        onClick={() => uphold(report)}
                      >
                        Uphold
                      </Button>
                      {report.targetType !== 'USER' && !report.subject.hidden ? (
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busy}
                          aria-keyshortcuts="h"
                          onClick={() => uphold(report, true)}
                        >
                          Uphold and hide
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        aria-keyshortcuts="d"
                        onClick={() => dismiss(report)}
                      >
                        Dismiss
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => decide.mutate({ reportId: report.id, decision: 'OPEN' })}
                      >
                        Put it back in the queue
                      </Button>
                      {report.targetType !== 'USER' && report.subject.hidden ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => {
                            const target = hideable(report)
                            if (target) setHidden.mutate({ ...target, hidden: false })
                          }}
                        >
                          Show it again
                        </Button>
                      ) : null}
                      {report.targetType !== 'USER' &&
                      !report.subject.hidden &&
                      report.state === 'UPHELD' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => {
                            const target = hideable(report)
                            if (target) {
                              setHidden.mutate({ ...target, hidden: true, reason: report.category })
                            }
                          }}
                        >
                          Hide it
                        </Button>
                      ) : null}
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Item 9.3 — past the first fifty. */}
        {list.hasNextPage ? (
          <div className="mt-6">
            <Button
              size="sm"
              disabled={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
            >
              {list.isFetchingNextPage ? 'Reading' : `Show ${String(more)} more`}
            </Button>
          </div>
        ) : null}

        {decide.data?.hidden ? (
          <p
            role="status"
            className="mt-4 border-l-2 border-rule bg-paper-sunk py-2 pl-4 text-[13.5px] text-ink"
          >
            Hidden. It reads as removed to everyone but its writer and the moderators, and
            &ldquo;Show it again&rdquo; undoes it. Nothing is deleted.
          </p>
        ) : null}
        {(setHidden.error ?? decide.error) ? (
          <p role="alert" className="mt-2 text-[13px] text-crimson">
            {(setHidden.error ?? decide.error)?.message}
          </p>
        ) : null}
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
    </>
  )
}

/** A key, as the legend names it. */
function Key({ children }: { children: string }) {
  return (
    <kbd className="rounded-control border border-rule bg-paper-sunk px-1 font-mono text-[11.5px] text-ink">
      {children}
    </kbd>
  )
}
