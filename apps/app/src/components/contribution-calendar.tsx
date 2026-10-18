'use client'

import { useState } from 'react'

import type { CalendarDay } from '@/server/activity'

/**
 * FR-9.3 — the 365-day contribution calendar: the days somebody wrote
 * something for someone else (D-6, decision 0049; phase 14, item 6.13).
 *
 * The GitHub pattern, chosen deliberately: writers already understand streaks,
 * and a grid of squares says "kept going" in a way a number cannot.
 *
 * Accessibility (NFR-4): the grid is a table with the months over it, so a
 * screen reader can read it row by row, and every square carries its own date
 * and count in text. Colour is never the only channel: the legend names the
 * counts each shade covers, and a square under the pointer or the focus writes
 * its day out in full below the grid, not only in a `title` nobody on a phone
 * can reach.
 */

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

/** Four steps, in blue pencil. Zero is the paper itself, not a pale blue. */
const STEPS = [
  { upTo: 0, tone: 'bg-paper-sunk', label: '0' },
  { upTo: 1, tone: 'bg-pencil/25', label: '1' },
  { upTo: 3, tone: 'bg-pencil/50', label: '2 to 3' },
  { upTo: 6, tone: 'bg-pencil/75', label: '4 to 6' },
  { upTo: Number.POSITIVE_INFINITY, tone: 'bg-pencil', label: '7 or more' },
] as const

function toneFor(count: number): string {
  return STEPS.find((step) => count <= step.upTo)?.tone ?? STEPS[0].tone
}

function describe(day: string, count: number): string {
  const date = new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
  if (count === 0) return `No help sent on ${date}`
  return count === 1 ? `Helped once on ${date}` : `Helped ${String(count)} times on ${date}`
}

export function ContributionCalendar({
  days,
  name,
  isSelf,
}: {
  days: CalendarDay[]
  /** Whose days: the heading reads "Days {name} wrote something for someone". */
  name: string
  isSelf: boolean
}) {
  const [shown, setShown] = useState<CalendarDay | null>(null)
  if (days.length === 0) return null

  // Columns are weeks, rows are weekdays — the layout everyone already reads.
  // The first column is padded so every row is the same weekday throughout.
  const first = new Date(`${days[0]!.day}T00:00:00Z`)
  const leadingBlanks = (first.getUTCDay() + 6) % 7

  const cells: Array<CalendarDay | null> = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...days,
  ]

  const weeks: Array<Array<CalendarDay | null>> = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

  // A month's name over the columns that begin in it; a stretch too narrow
  // for a name is left unlabelled rather than overlapping its neighbour.
  const months: Array<{ key: string; span: number }> = []
  for (const week of weeks) {
    const key = week.find((day): day is CalendarDay => day !== null)?.day.slice(0, 7) ?? ''
    const last = months[months.length - 1]
    if (last?.key === key) last.span += 1
    else months.push({ key, span: 1 })
  }
  const monthName = (key: string) => MONTHS[Number(key.slice(5, 7)) - 1] ?? ''

  const activeDays = days.filter((day) => day.count > 0).length
  const summary =
    activeDays === 0
      ? 'No help sent in the last year.'
      : `Helped on ${String(activeDays)} ${activeDays === 1 ? 'day' : 'days'} in the last year.`

  return (
    <div>
      <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
        Days {isSelf ? 'you' : name} wrote something for someone
      </h2>
      <p className="mt-1.5 text-[13px] text-ink-soft">{summary}</p>

      {/* Horizontal scroll is confined to this block, never the page. */}
      <div className="mt-3 overflow-x-auto pb-1">
        <table className="border-separate border-spacing-[3px]">
          <caption className="sr-only">Help sent per day over the last year: {summary}</caption>
          <thead>
            <tr>
              <td aria-hidden />
              {months.map((month, index) => (
                <th
                  key={`${month.key}-${String(index)}`}
                  scope="colgroup"
                  colSpan={month.span}
                  className="h-4 text-left align-bottom text-[10px] font-normal whitespace-nowrap text-ink-faint"
                >
                  <span className={month.span >= 3 ? '' : 'sr-only'}>{monthName(month.key)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WEEKDAYS.map((weekday, row) => (
              <tr key={weekday}>
                <th
                  scope="row"
                  className="pr-1.5 text-right align-middle text-[10px] font-normal text-ink-faint"
                >
                  {/* Every other label, so the column stays narrow. */}
                  <span className={row % 2 === 1 ? '' : 'sr-only'}>{weekday}</span>
                </th>
                {weeks.map((week, column) => {
                  const day = week[row]
                  if (!day) {
                    return <td key={column} className="size-[11px]" aria-hidden />
                  }
                  return (
                    <td
                      key={column}
                      tabIndex={0}
                      title={describe(day.day, day.count)}
                      onFocus={() => setShown(day)}
                      onMouseEnter={() => setShown(day)}
                      className={`size-[11px] rounded-[2px] outline-offset-1 focus-visible:outline-2 focus-visible:outline-pencil ${toneFor(day.count)}`}
                    >
                      <span className="sr-only">{describe(day.day, day.count)}</span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-[11px] text-ink-faint">
        {/* The day under the pointer or the focus, in words; a phone has no title to hover. */}
        <p role="status" aria-live="polite" className="min-h-4">
          {shown ? describe(shown.day, shown.count) : ''}
        </p>
        <ul className="flex items-center gap-2.5" aria-label="What each shade means">
          {STEPS.map((step) => (
            <li key={step.label} className="flex items-center gap-1">
              <span aria-hidden className={`size-[11px] rounded-[2px] ${step.tone}`} />
              <span>{step.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
