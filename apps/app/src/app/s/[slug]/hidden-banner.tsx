import Link from '@/components/link'

import { REPORT_CATEGORIES } from '@/lib/schemas/report'

/**
 * Item 2.7 (decision 0045) — shown across a hidden story to the only people
 * who can still open it: its authors and the moderators. It names the reason
 * and the way to answer; it does not argue.
 */
export function HiddenStoryBanner({ reason }: { reason: string | null }) {
  const label = REPORT_CATEGORIES.find((category) => category.value === reason)?.label
  return (
    <section
      aria-label="Hidden after a report"
      className="border-b border-crimson/40 bg-paper-sunk"
    >
      <div className="mx-auto max-w-5xl px-6 py-2.5 text-[13.5px] leading-relaxed text-ink">
        <p>
          This story was hidden after a report{label ? ` (${label.toLowerCase()})` : ''}. Only its
          authors and the moderators can open it; to everyone else it is not here. Nothing has been
          deleted. If you think that&rsquo;s wrong,{' '}
          <Link href="/contact" className="underline">
            write to a person
          </Link>
          .
        </p>
      </div>
    </section>
  )
}
