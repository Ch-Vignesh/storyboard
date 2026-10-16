'use client'

import { useQuery } from '@tanstack/react-query'

import { ComparisonView } from '@/components/comparison-view'
import { useTRPC } from '@/trpc/client'

/**
 * FR-7.5 — two revisions of one section, side by side, from the comparison
 * engine. The history (a version against the one before it, or against the
 * current text, or any two) and the comparison of two versions of a story
 * both use it: "inputs are always two revision ids".
 */
export function RevisionComparison({
  baseId,
  targetId,
  leftLabel,
  rightLabel,
}: {
  baseId: string
  targetId: string
  leftLabel: string
  rightLabel: string
}) {
  const trpc = useTRPC()
  const comparison = useQuery(trpc.compare.revisions.queryOptions({ baseId, targetId }))

  if (comparison.isPending) {
    return <p className="mt-3 text-[13px] text-ink-faint">Comparing…</p>
  }
  if (comparison.isError) {
    // The earlier version can be one written while the story was private,
    // which a reader may not see (decisions 0007 and 0039).
    return (
      <p role="alert" className="mt-3 text-[13px] text-crimson">
        {comparison.error.message}
      </p>
    )
  }
  return (
    <div className="mt-4">
      <ComparisonView result={comparison.data} leftLabel={leftLabel} rightLabel={rightLabel} />
    </div>
  )
}
