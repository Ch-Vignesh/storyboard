'use client'

import { useQuery } from '@tanstack/react-query'

import { useTRPC } from '@/trpc/client'

/**
 * Decision 0043 (phase 14, item 2b.4) — the numbers the admin opens on.
 * Counts, never pages of a hundred: the question is "how is the place doing",
 * and a number answers it where a list would need reading.
 */
export function OverviewPanel() {
  const trpc = useTRPC()
  const { data, isPending } = useQuery(trpc.admin.overview.queryOptions())

  const groups = data
    ? [
        {
          heading: 'Members',
          items: [
            ['In all', data.members.total],
            [`New in ${data.windows.recent} days`, data.members.newRecent],
            [`New in ${data.windows.month} days`, data.members.newMonth],
            [`Here in the last ${data.windows.recent} days`, data.members.seenRecent],
            [`Here in the last ${data.windows.month} days`, data.members.seenMonth],
          ] as const,
        },
        {
          heading: 'Writing',
          items: [
            ['Stories', data.stories],
            ['Open requests', data.openRequests],
            ['Suggestions sent', data.suggestions.sent],
            ['Suggestions accepted', data.suggestions.accepted],
            ['Ideas that helped', data.ideasHelped],
          ] as const,
        },
        {
          heading: 'Trust',
          items: [['Open reports', data.openReports]] as const,
        },
      ]
    : []

  return (
    <section aria-labelledby="overview-heading" className="mt-8">
      <h2
        id="overview-heading"
        className="text-[12px] font-medium tracking-wide text-ink-faint uppercase"
      >
        The numbers
      </h2>
      <p className="mt-2 max-w-measure text-[13.5px] leading-relaxed text-ink-soft">
        Real activity only: seeded stories, the help written on them and deleted accounts are not
        counted. &ldquo;Here&rdquo; means the account did something while signed in.
      </p>

      {isPending ? (
        <p className="mt-4 text-[13.5px] text-ink-faint">Counting…</p>
      ) : (
        groups.map((group) => (
          <div key={group.heading} className="mt-5">
            <h3 className="text-[12.5px] font-medium text-ink-soft">{group.heading}</h3>
            <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-5">
              {group.items.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[12px] text-ink-faint">{label}</dt>
                  <dd className="mt-0.5 text-[18px] text-ink tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))
      )}
    </section>
  )
}
