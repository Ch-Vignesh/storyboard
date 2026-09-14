'use client'

import { Button } from '@storyboard/ui/components/button'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { useTRPC } from '@/trpc/client'
import type { AppRouter } from '@/server/trpc/routers/_app'
import type { inferRouterOutputs } from '@trpc/server'

type History = inferRouterOutputs<AppRouter>['section']['history']
type Revision = History['revisions'][number]

/** FR-8.3 — the label says where a version came from, in plain words. */
const SOURCE_LABELS: Record<Revision['source'], string> = {
  AUTHORED: 'written by the author',
  ACCEPTED: 'accepted from a suggestion',
  RESTORED: 'restored from an earlier version',
  IMPORTED: 'brought in from a file',
}

export function HistoryPanel({
  sectionId,
  initial,
  canRestore,
  backHref,
}: {
  sectionId: string
  initial: History
  canRestore: boolean
  backHref: string
}) {
  const trpc = useTRPC()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [comparing, setComparing] = useState<string | null>(null)

  const history = useQuery({
    ...trpc.section.history.queryOptions({ sectionId }),
    initialData: initial,
  })

  const restore = useMutation(
    trpc.section.restoreRevision.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.section.history.queryKey() })
        router.refresh()
      },
    }),
  )

  const revisions = history.data?.revisions ?? []
  const head = history.data?.currentRevisionId ?? null

  return (
    <div className="mt-8">
      {history.data?.truncatedByVisibility ? (
        // Decision 0007 — an incomplete chain is explained, not hidden.
        <p className="mb-6 border-l-2 border-rule py-1 pl-4 text-[12.5px] leading-relaxed text-ink-faint">
          This storyboard was private for part of its life. Versions written then are visible to its
          authors only.
        </p>
      ) : null}

      <ol className="divide-y divide-rule border-y border-rule">
        {revisions.map((revision) => {
          const isHead = revision.id === head
          return (
            <li key={revision.id} className="py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                  <p className="text-[14px] text-ink">
                    <time dateTime={revision.createdAt.toISOString()}>
                      {revision.createdAt.toLocaleString('en-GB', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                    {isHead ? (
                      <span className="ml-2 border border-moss/40 bg-moss-wash px-1.5 py-0.5 text-[11px] text-moss">
                        current
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-[12.5px] text-ink-faint">
                    {revision.author.displayName ?? revision.author.username ?? 'Unknown'}
                    {' · '}
                    {SOURCE_LABELS[revision.source]}
                    {revision.acceptedBy
                      ? `, accepted by ${revision.acceptedBy.displayName ?? revision.acceptedBy.username}`
                      : ''}
                    {' · '}
                    <span className="tabular-nums">
                      {revision.wordCount.toLocaleString('en-GB')} words
                    </span>
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setComparing(comparing === revision.id ? null : revision.id)}
                    aria-expanded={comparing === revision.id}
                  >
                    {comparing === revision.id ? 'Hide' : 'Compare with current'}
                  </Button>
                  {canRestore && !isHead ? (
                    <Button
                      size="sm"
                      onClick={() => restore.mutate({ sectionId, revisionId: revision.id })}
                      disabled={restore.isPending}
                    >
                      Restore this version
                    </Button>
                  ) : null}
                </div>
              </div>

              {comparing === revision.id ? (
                // FR-8.3 asks for a one-tap comparison against the head. The
                // comparison view itself is phase 2 (FR-7, packages/compare);
                // until then this names both sides honestly rather than
                // pretending to show a difference it cannot compute yet.
                <div className="mt-3 border border-rule bg-paper-sunk px-4 py-3 text-[13px] text-ink-soft">
                  <p>
                    Comparing this version with the current text. The side-by-side view arrives with
                    the comparison engine.
                  </p>
                  <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-[12.5px]">
                    <dt className="text-ink-faint">This version</dt>
                    <dd className="tabular-nums">
                      {revision.wordCount.toLocaleString('en-GB')} words ·{' '}
                      <code className="text-[11.5px]">{revision.contentHash.slice(0, 12)}</code>
                    </dd>
                    <dt className="text-ink-faint">Current</dt>
                    <dd className="tabular-nums">
                      {(
                        revisions.find((entry) => entry.id === head)?.wordCount ?? 0
                      ).toLocaleString('en-GB')}{' '}
                      words
                    </dd>
                  </dl>
                </div>
              ) : null}
            </li>
          )
        })}
      </ol>

      {restore.isError ? (
        <p role="alert" className="mt-3 text-[13px] text-crimson">
          {restore.error.message}
        </p>
      ) : null}

      <p className="mt-6 text-[13.5px]">
        <a href={backHref} className="text-pencil hover:underline">
          Back to the storyboard
        </a>
      </p>
    </div>
  )
}
