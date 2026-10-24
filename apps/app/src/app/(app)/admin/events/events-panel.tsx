'use client'

import { Button } from '@storyboard/ui/components/button'
import { Input } from '@storyboard/ui/components/input'
import { Label } from '@storyboard/ui/components/label'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useState } from 'react'

import Link from '@/components/link'
import { describeAuditEvent } from '@/lib/audit-events'
import { CAPABILITY_LABELS, type AdminCapability } from '@/lib/authz/admin'
import { AUDIT_LOG } from '@/lib/schemas/constants'
import { formatInZone } from '@/lib/time-zone'
import { useTRPC } from '@/trpc/client'

type Filter = { story?: string; person?: string }

/** The parts of an event's detail worth reading, in words; ids are for the logs. */
const DETAIL_WORDS: Record<string, string> = {
  reason: 'reason',
  category: 'category',
  upheld: 'upheld reports',
  capabilities: 'grants',
  creditsNoLongerLive: 'credits no longer live',
  requestsClosed: 'requests closed',
}

function wordsFor(value: unknown): string {
  if (Array.isArray(value)) {
    return value.length === 0
      ? 'none'
      : value
          .map((entry) => CAPABILITY_LABELS[entry as AdminCapability] ?? String(entry))
          .join(', ')
  }
  if (typeof value === 'string') return value.toLowerCase().replaceAll('_', ' ')
  return String(value)
}

function detailLine(detail: Record<string, unknown> | null): string {
  if (!detail) return ''
  return Object.entries(detail)
    .filter(([key, value]) => key in DETAIL_WORDS && value !== null && value !== undefined)
    .map(([key, value]) => `${DETAIL_WORDS[key] ?? key}: ${wordsFor(value)}`)
    .join(' · ')
}

/**
 * Phase 14, item 10.2 (NFR-7) — the stored events, newest first, for one
 * story (by its address), one person (by exact username or email, as People
 * finds them: what they did and what was done about them), both, or every
 * event. "Show older" pages on by cursor. Dates are in the reader's own zone
 * (item 1.18).
 */
export function EventsPanel({ timeZone }: { timeZone: string }) {
  const trpc = useTRPC()
  const [story, setStory] = useState('')
  const [person, setPerson] = useState('')
  const [filter, setFilter] = useState<Filter>({})
  const filtered = Boolean(filter.story ?? filter.person)

  const list = useInfiniteQuery(
    trpc.admin.events.infiniteQueryOptions(filter, {
      getNextPageParam: (page) => page.nextCursor ?? undefined,
    }),
  )
  const first = list.data?.pages[0]
  const events = list.data?.pages.flatMap((page) => page.events) ?? []

  return (
    <section aria-labelledby="events-heading" className="mt-8">
      <h2
        id="events-heading"
        className="text-[12px] font-medium tracking-wide text-ink-faint uppercase"
      >
        Find events
      </h2>
      <form
        role="search"
        className="mt-3 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          setFilter({ story: story.trim() || undefined, person: person.trim() || undefined })
        }}
      >
        <div className="min-w-56 flex-1">
          <Label htmlFor="events-story">A story&rsquo;s address</Label>
          <Input
            id="events-story"
            className="mt-1"
            value={story}
            maxLength={AUDIT_LOG.filterMaxChars}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setStory(event.target.value)}
          />
        </div>
        <div className="min-w-56 flex-1">
          <Label htmlFor="events-person">A username or email address</Label>
          <Input
            id="events-person"
            className="mt-1"
            value={person}
            maxLength={AUDIT_LOG.filterMaxChars}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setPerson(event.target.value)}
          />
        </div>
        <Button type="submit" disabled={list.isFetching}>
          Show the events
        </Button>
        {filtered ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setStory('')
              setPerson('')
              setFilter({})
            }}
          >
            Show every event
          </Button>
        ) : null}
      </form>

      {list.isPending ? (
        <p className="mt-4 text-[13.5px] text-ink-faint">Reading…</p>
      ) : list.error ? (
        <p role="alert" className="mt-4 text-[13px] text-crimson">
          {list.error.message}
        </p>
      ) : first?.unknown === 'story' ? (
        <p className="mt-4 text-[14px] text-ink-soft">No story has that address.</p>
      ) : first?.unknown === 'person' ? (
        <p className="mt-4 text-[14px] text-ink-soft">Nobody has that username or address.</p>
      ) : events.length === 0 ? (
        <p className="mt-4 text-[14px] text-ink-soft">
          {filter.person
            ? 'Nothing has been kept that they did, or that was done about them.'
            : filter.story
              ? 'Nothing has been kept about this story.'
              : 'Nothing has been kept yet.'}
        </p>
      ) : (
        <>
          {first?.story || first?.person ? (
            <p className="mt-4 text-[13px] text-ink-soft">
              {[
                first.story ? `On ${first.story.title}` : null,
                first.person ? `By or about ${first.person.name}` : null,
              ]
                .filter(Boolean)
                .join(', ')}
            </p>
          ) : null}
          <ul className="mt-3 divide-y divide-rule border-y border-rule">
            {events.map((entry) => {
              const named =
                entry.targetType === 'NAME'
                  ? `@${entry.targetId ?? ''}`
                  : entry.targetType === 'FLAG'
                    ? entry.targetId
                    : null
              const more = detailLine(entry.detail)
              return (
                <li key={entry.id} className="py-3">
                  <p className="text-[14px] leading-relaxed text-ink">
                    <span className="font-medium">{entry.actor ?? 'Draftboard'}</span>{' '}
                    {describeAuditEvent(entry.event, entry.targetType, entry.detail)}
                    {named ? <span className="font-mono text-[13px]"> {named}</span> : null}
                    {entry.subject && entry.subject !== entry.actor ? (
                      <span className="text-ink-soft"> · about {entry.subject}</span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-ink-faint">
                    {formatInZone(entry.at, 'dateTime', timeZone)}
                    {entry.story ? (
                      <>
                        {' · '}
                        {entry.story.slug ? (
                          <Link
                            href={`/s/${entry.story.slug}`}
                            className="text-pencil hover:underline"
                          >
                            {entry.story.title}
                          </Link>
                        ) : (
                          (entry.story.title ?? 'a story since removed')
                        )}
                      </>
                    ) : null}
                    {more ? ` · ${more}` : null}
                  </p>
                </li>
              )
            })}
          </ul>
          {list.hasNextPage ? (
            <div className="mt-6">
              <Button
                size="sm"
                disabled={list.isFetchingNextPage}
                onClick={() => void list.fetchNextPage()}
              >
                {list.isFetchingNextPage ? 'Reading' : 'Show older'}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}
