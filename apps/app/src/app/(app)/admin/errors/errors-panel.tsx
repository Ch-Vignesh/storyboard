'use client'

import { useQuery } from '@tanstack/react-query'

import { formatInZone } from '@/lib/time-zone'
import { useTRPC } from '@/trpc/client'

/**
 * Phase 14, item 10.1 (NFR-7, D-10) — one entry per kind of fault: where it
 * happened, the error, how often and since when, whether the administrators
 * have been emailed about it, and the top of the newest one's stack behind a
 * disclosure. Dates are in the reader's own zone (item 1.18).
 */
export function ErrorsPanel({ timeZone }: { timeZone: string }) {
  const trpc = useTRPC()
  const { data, isPending, error } = useQuery(trpc.admin.errors.queryOptions())

  return (
    <section aria-labelledby="errors-heading" className="mt-8">
      <h2
        id="errors-heading"
        className="text-[12px] font-medium tracking-wide text-ink-faint uppercase"
      >
        Kinds of error
      </h2>

      {isPending ? (
        <p className="mt-4 text-[13.5px] text-ink-faint">Reading…</p>
      ) : error ? (
        <p role="alert" className="mt-4 text-[13px] text-crimson">
          {error.message}
        </p>
      ) : data.kinds.length === 0 ? (
        <p className="mt-3 text-[14px] text-ink-soft">
          None. Nothing has failed that the code did not expect.
        </p>
      ) : (
        <>
          <ul className="mt-4 divide-y divide-rule border-y border-rule">
            {data.kinds.map((kind) => (
              <li key={kind.fingerprint} className="py-3">
                <p className="font-mono text-[13px] break-all text-ink">
                  {kind.location} <span className="text-ink-faint">({kind.source})</span>
                </p>
                <p className="mt-1 text-[14px] break-words text-ink">
                  {kind.name}: {kind.message}
                </p>
                <p className="mt-1 text-[12.5px] text-ink-faint">
                  {kind.count === 1 ? 'Once' : `${String(kind.count)} times`}, first{' '}
                  {formatInZone(kind.firstSeen, 'shortTime', timeZone)}, last{' '}
                  {formatInZone(kind.lastSeen, 'shortTime', timeZone)} ·{' '}
                  {kind.announced ? 'emailed' : 'not emailed yet'}
                </p>
                {kind.stack ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[12.5px] text-pencil">
                      The top of the stack
                    </summary>
                    <pre className="mt-2 overflow-x-auto bg-paper-sunk p-3 font-mono text-[12px] leading-relaxed text-ink-soft">
                      {kind.stack}
                    </pre>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
          {data.total > data.kinds.length ? (
            <p className="mt-3 text-[12.5px] text-ink-faint">
              Showing the {data.kinds.length} most recent of {data.total} kinds.
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}
