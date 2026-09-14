import type { CalendarDay } from '@/server/activity'

/**
 * FR-9.3 — the 365-day contribution calendar.
 *
 * The GitHub pattern, chosen deliberately: writers already understand streaks,
 * and a grid of squares says "kept going" in a way a number cannot.
 *
 * Accessibility (NFR-4): the grid is a table, so a screen reader can read it
 * row by row, and every square carries its own date and count in text. Colour
 * is never the only channel — the title attribute and the table cell text both
 * state the count.
 */

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

/** Four steps, in blue pencil. Zero is the paper itself, not a pale blue. */
function toneFor(count: number): string {
  if (count === 0) return 'bg-paper-sunk'
  if (count === 1) return 'bg-pencil/25'
  if (count <= 3) return 'bg-pencil/50'
  if (count <= 6) return 'bg-pencil/75'
  return 'bg-pencil'
}

function describe(day: string, count: number): string {
  const date = new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
  if (count === 0) return `No contributions on ${date}`
  return `${String(count)} ${count === 1 ? 'contribution' : 'contributions'} on ${date}`
}

export function ContributionCalendar({ days }: { days: CalendarDay[] }) {
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

  const total = days.reduce((sum, day) => sum + day.count, 0)
  const activeDays = days.filter((day) => day.count > 0).length

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
          The last year
        </h2>
        <p className="text-[12.5px] text-ink-faint">
          <span className="tabular-nums">{total.toLocaleString('en-GB')}</span>{' '}
          {total === 1 ? 'contribution' : 'contributions'} on{' '}
          <span className="tabular-nums">{activeDays}</span> {activeDays === 1 ? 'day' : 'days'}
        </p>
      </div>

      {/* Horizontal scroll is confined to this block, never the page. */}
      <div className="mt-3 overflow-x-auto pb-1">
        <table className="border-separate border-spacing-[3px]">
          <caption className="sr-only">
            Contributions per day over the last year, {total} in total across {activeDays} days.
          </caption>
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
                      title={describe(day.day, day.count)}
                      className={`size-[11px] rounded-[2px] ${toneFor(day.count)}`}
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

      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-faint">
        <span>Less</span>
        {[0, 1, 3, 6, 9].map((count) => (
          <span key={count} aria-hidden className={`size-[11px] rounded-[2px] ${toneFor(count)}`} />
        ))}
        <span>More</span>
      </div>
    </div>
  )
}
