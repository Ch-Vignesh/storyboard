'use client'

import { Select } from '@storyboard/ui/components/select'
import { useQuery } from '@tanstack/react-query'
import Link from '@/components/link'
import { useState } from 'react'

import { RevisionComparison } from '@/components/revision-comparison'
import { useTRPC } from '@/trpc/client'

type VersionOption = { id: string; name: string; isMain: boolean }

/**
 * FR-7.5 — what is different between two versions.
 *
 * Section by section, not word by word. Two versions of a novel differ in whole
 * scenes; a word-level comparison of 120,000 words would be both slow and
 * unreadable, and the per-section comparison already exists one click away.
 */
const STATE_COPY = {
  same: { label: 'Unchanged', className: 'text-ink-faint' },
  changed: { label: 'Rewritten', className: 'text-ochre' },
  added: { label: 'Only here', className: 'text-moss' },
  removed: { label: 'Not here', className: 'text-crimson' },
} as const

export function ComparePanel({
  slug,
  versions,
  initialBase,
  initialTarget,
}: {
  slug: string
  versions: VersionOption[]
  initialBase: string
  initialTarget: string
}) {
  const trpc = useTRPC()
  const [baseVersionId, setBase] = useState(initialBase)
  const [targetVersionId, setTarget] = useState(initialTarget)
  // FR-7.5 — the section open for reading, by lineage.
  const [open, setOpen] = useState<string | null>(null)

  const comparison = useQuery({
    ...trpc.compare.versions.queryOptions({ baseVersionId, targetVersionId }),
    enabled: baseVersionId !== targetVersionId,
  })

  const nameOfVersion = (id: string) => versions.find((version) => version.id === id)?.name ?? ''

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 text-[12px] font-medium tracking-wide text-ink-faint uppercase">
          This one
          <Select value={baseVersionId} onChange={(event) => setBase(event.target.value)}>
            {versions.map((version) => (
              <option key={version.id} value={version.id}>
                {version.name}
                {version.isMain ? ' (main draft)' : ''}
              </option>
            ))}
          </Select>
        </label>
        <span className="pb-2 text-[13px] text-ink-faint">against</span>
        <label className="flex flex-col gap-1.5 text-[12px] font-medium tracking-wide text-ink-faint uppercase">
          That one
          <Select value={targetVersionId} onChange={(event) => setTarget(event.target.value)}>
            {versions.map((version) => (
              <option key={version.id} value={version.id}>
                {version.name}
                {version.isMain ? ' (main draft)' : ''}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {baseVersionId === targetVersionId ? (
        <p className="mt-6 text-[14.5px] text-ink-soft">
          Those are the same version. Pick two different ones.
        </p>
      ) : comparison.isPending ? (
        <p className="mt-6 text-[14.5px] text-ink-faint">Reading both drafts…</p>
      ) : comparison.error ? (
        <p role="alert" className="mt-6 text-[14.5px] text-crimson">
          {comparison.error.message}
        </p>
      ) : comparison.data ? (
        <>
          <p className="mt-6 text-[13.5px] text-ink-soft">
            {comparison.data.stats.changed} rewritten · {comparison.data.stats.added} only in{' '}
            {nameOfVersion(targetVersionId)} · {comparison.data.stats.removed} only in{' '}
            {nameOfVersion(baseVersionId)} · {comparison.data.stats.same} unchanged
          </p>

          <ul className="mt-5 divide-y divide-rule border-y border-rule">
            {comparison.data.rows.map((row) => {
              const copy = STATE_COPY[row.state]
              return (
                <li key={row.lineageId} className="py-3 text-[14px]">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="min-w-0 truncate text-ink">{row.title}</span>
                    <span className="flex shrink-0 items-baseline gap-3">
                      <span className="text-[12.5px] text-ink-faint tabular-nums">
                        {row.baseWords.toLocaleString('en-GB')} →{' '}
                        {row.targetWords.toLocaleString('en-GB')}
                      </span>
                      <span className={`text-[12.5px] ${copy.className}`}>{copy.label}</span>
                      {/* FR-7.5's third case, shown rather than only counted:
                          the same comparison as everywhere else, of the two
                          versions' text of this section. Until the 2026-10-16
                          spec review this list was all there was. */}
                      {row.state === 'changed' && row.baseRevisionId && row.targetRevisionId ? (
                        <button
                          type="button"
                          className="text-[12.5px] text-pencil hover:underline"
                          aria-expanded={open === row.lineageId}
                          onClick={() => setOpen(open === row.lineageId ? null : row.lineageId)}
                        >
                          {open === row.lineageId ? 'Hide' : 'Show the difference'}
                        </button>
                      ) : null}
                    </span>
                  </div>
                  {open === row.lineageId && row.baseRevisionId && row.targetRevisionId ? (
                    <RevisionComparison
                      baseId={row.baseRevisionId}
                      targetId={row.targetRevisionId}
                      leftLabel={nameOfVersion(baseVersionId)}
                      rightLabel={nameOfVersion(targetVersionId)}
                    />
                  ) : null}
                </li>
              )
            })}
          </ul>

          <p className="mt-6 text-[13px] text-ink-faint">
            Open a section in either version to read it in full, or its{' '}
            <Link href={`/s/${slug}/versions`} className="text-pencil hover:underline">
              versions page
            </Link>{' '}
            to make one the main draft.
          </p>
        </>
      ) : null}
    </div>
  )
}
