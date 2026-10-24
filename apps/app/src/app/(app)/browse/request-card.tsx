import { ExampleLabel } from '@/components/example-label'
import Link from '@/components/link'

import { REQUEST_KINDS, closesOn } from '@/lib/schemas/help'
import { formatInZone } from '@/lib/time-zone'

type Request = {
  id: string
  publicId: string
  kind: 'REWRITE' | 'CONTINUE' | 'UNBLOCK'
  title: string
  ask: string
  minWords: number
  maxWords: number
  createdAt: Date
  /** Item 6.15 — "Closes on" counts from it. */
  openedAt: Date
  quiet: boolean
  storyboard: {
    slug: string
    title: string
    isSeed: boolean
    owner: { username: string | null; displayName: string | null }
    genres: Array<{ genre: { id: string; name: string } }>
  }
  _count: { suggestions: number; ideas: number }
}

/**
 * One stuck passage. The kind and the size lead, because those are what decide
 * whether a helper can take it on; the title is what makes them want to.
 */
export function RequestCard({ request, timeZone }: { request: Request; timeZone: string }) {
  const kind = REQUEST_KINDS.find((option) => option.value === request.kind)
  const answers = request.kind === 'UNBLOCK' ? request._count.ideas : request._count.suggestions
  const ask = request.ask.length > 200 ? `${request.ask.slice(0, 200).trimEnd()}…` : request.ask

  return (
    <Link
      href={`/s/${request.storyboard.slug}/help/${request.publicId}`}
      className="flex h-full flex-col border border-rule bg-paper px-4 py-4 transition-colors hover:border-ochre hover:bg-ochre-wash/30"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11.5px] tracking-wide text-ochre uppercase">{kind?.label}</span>
        {request.storyboard.isSeed ? <ExampleLabel /> : null}
        {/* FR-12.4's threshold, shown as context rather than as a warning: a
            request with no answers is a normal state (FR-15.1). */}
        {request.quiet ? (
          <span className="text-[11.5px] text-ink-faint">waiting a while</span>
        ) : null}
      </div>

      <h3 className="mt-1.5 font-manuscript text-[19px] leading-snug text-ink">{request.title}</h3>

      <p className="mt-2 flex-1 text-[13px] leading-relaxed text-ink-soft">{ask}</p>

      <div className="mt-3 border-t border-rule/70 pt-2.5 text-[12px] text-ink-faint">
        <p className="truncate">
          {request.storyboard.title} ·{' '}
          {request.storyboard.owner.displayName ?? request.storyboard.owner.username}
        </p>
        <p className="mt-0.5">
          {request.kind === 'UNBLOCK'
            ? `${String(answers)} ${answers === 1 ? 'idea' : 'ideas'}`
            : `${String(answers)} ${answers === 1 ? 'suggestion' : 'suggestions'} · ${String(request.minWords)}–${String(request.maxWords)} words`}
          {/* Item 9.1 (FR-11.3) — when it was opened, or opened again: the
              date the list is in order of, in the reader's zone. */}
          {' · Opened '}
          <time dateTime={request.openedAt.toISOString()}>
            {formatInZone(request.openedAt, 'dayMonth', timeZone)}
          </time>
          {/* Item 6.15 (D-8) — said from the day it opens, in the reader's zone. */}
          {` · Closes on ${formatInZone(closesOn(request.openedAt), 'dayMonth', timeZone)}`}
        </p>
      </div>
    </Link>
  )
}
