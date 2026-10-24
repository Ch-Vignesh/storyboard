import { cn } from '@storyboard/ui/cn'

/**
 * FR-15.3 (phase 14, item 7.7) — a seeded story never looks like a real
 * person's. One label, the same everywhere a seeded story is named: the
 * reader, browse, the dashboard, a request, a suggestion, the composer, the
 * comparison, contributors, lineage and notifications.
 */
export function ExampleLabel({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-block border border-ochre/40 bg-ochre-wash px-1.5 py-px align-middle text-[10.5px] leading-normal tracking-wide text-ochre uppercase',
        className,
      )}
    >
      Example
    </span>
  )
}
