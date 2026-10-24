'use client'

import { Button } from '@storyboard/ui/components/button'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { RevisionComparison } from '@/components/revision-comparison'
import { listOf } from '@/lib/impact-words'
import { nameOf } from '@/lib/people'
import { PASS_CHIPS } from '@/lib/schemas/help'
import { formatInZone } from '@/lib/time-zone'
import { useTRPC } from '@/trpc/client'
import type { AppRouter } from '@/server/trpc/routers/_app'
import type { inferRouterOutputs } from '@trpc/server'

type History = inferRouterOutputs<AppRouter>['section']['history']
type Revision = History['revisions'][number]
type Chip = (typeof PASS_CHIPS)[number]['value']

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
  viewerId,
  backHref,
  timeZone,
}: {
  sectionId: string
  initial: History
  canRestore: boolean
  /** Whose versions may carry a proof of authorship (FR-13.6). */
  viewerId: string | null
  backHref: string
  /**
   * The reader's zone, from the server (item 1.18). The same one on both
   * sides, so the hours do not change on load: they were rendered in the
   * server's zone and again in the browser's.
   */
  timeZone: string
}) {
  const trpc = useTRPC()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [comparing, setComparing] = useState<Comparing | null>(null)
  // FR-7.5 — any two versions, not only one against its parent or the
  // current text. Picked in the list, compared above it.
  const [picked, setPicked] = useState<string[]>([])
  const toggle = (next: Comparing) =>
    setComparing(
      comparing?.revisionId === next.revisionId && comparing.against === next.against ? null : next,
    )
  const pick = (id: string) =>
    setPicked((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id].slice(-2),
    )

  // FR-8.3 — every version, a page at a time. Only the newest fifty could
  // be seen until the 2026-10-16 spec review.
  const history = useInfiniteQuery(
    trpc.section.history.infiniteQueryOptions(
      { sectionId },
      {
        getNextPageParam: (page) => page.nextCursor,
        initialData: { pages: [initial], pageParams: [null] },
      },
    ),
  )

  // Item 5.3 (FR-8.4, FR-8.5) — restoring asks first, naming the people
  // whose accepted words would leave the main draft.
  const [restoring, setRestoring] = useState<string | null>(null)
  // FR-8.6 (item 8.14) — an optional reason, one of FR-6.10's chips.
  const [reason, setReason] = useState<Chip | null>(null)
  const restoreImpact = useQuery({
    ...trpc.section.restoreImpact.queryOptions({ sectionId, revisionId: restoring ?? '' }),
    enabled: restoring !== null,
  })
  const restore = useMutation(
    trpc.section.restoreRevision.mutationOptions({
      onSuccess: async () => {
        setRestoring(null)
        setReason(null)
        await queryClient.invalidateQueries({ queryKey: trpc.section.history.pathKey() })
        router.refresh()
      },
    }),
  )

  const pages = history.data?.pages ?? [initial]
  const revisions = pages.flatMap((page) => page.revisions)
  const head = pages[0]?.currentRevisionId ?? null
  const byId = new Map(revisions.map((revision) => [revision.id, revision]))
  // Older on the left, whichever was picked first.
  const pair =
    picked.length === 2
      ? [...picked].sort(
          (a, b) =>
            (byId.get(a)?.createdAt.getTime() ?? 0) - (byId.get(b)?.createdAt.getTime() ?? 0),
        )
      : null

  return (
    <div className="mt-8">
      {pages[0]?.truncatedByVisibility ? (
        // Decision 0007 — an incomplete chain is explained, not hidden.
        <p className="mb-6 border-l-2 border-rule py-1 pl-4 text-[12.5px] leading-relaxed text-ink-faint">
          This story was private for part of its life. Versions written then are visible to its
          authors only.
        </p>
      ) : null}

      {pair ? (
        <div className="mb-8 border border-rule px-4 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="text-[13px] text-ink-soft">Comparing the two versions you picked.</p>
            <Button size="sm" variant="ghost" onClick={() => setPicked([])}>
              Clear
            </Button>
          </div>
          <RevisionComparison
            baseId={pair[0] ?? ''}
            targetId={pair[1] ?? ''}
            leftLabel={labelOf(byId.get(pair[0] ?? ''), timeZone)}
            rightLabel={labelOf(byId.get(pair[1] ?? ''), timeZone)}
          />
        </div>
      ) : picked.length === 1 ? (
        <p className="mb-6 text-[13px] text-ink-faint">Pick one more version to compare.</p>
      ) : null}

      <ol className="divide-y divide-rule border-y border-rule">
        {revisions.map((revision) => {
          const isHead = revision.id === head
          // Item 8.12 — not a restore: its words are whoever wrote the version it copied.
          const mine =
            viewerId !== null && revision.author?.id === viewerId && revision.source !== 'RESTORED'
          return (
            <li key={revision.id} className="py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                  <p className="text-[14px] text-ink">
                    <time dateTime={revision.createdAt.toISOString()}>
                      {formatInZone(revision.createdAt, 'dateTime', timeZone)}
                    </time>
                    {isHead ? (
                      <span className="ml-2 border border-moss/40 bg-moss-wash px-1.5 py-0.5 text-[11px] text-moss">
                        current
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-[12.5px] text-ink-faint">
                    {nameOf(revision.author)}
                    {' · '}
                    {/* FR-8.4 — "restored from 12 Sep", not only "restored". */}
                    {revision.source === 'RESTORED' && revision.restoredFrom
                      ? `restored from ${formatInZone(revision.restoredFrom.createdAt, 'dayMonthShort', timeZone)}`
                      : SOURCE_LABELS[revision.source]}
                    {/* FR-8.6 (item 8.14) — and why, when they said. */}
                    {revision.restoreReason
                      ? `, “${PASS_CHIPS.find((chip) => chip.value === revision.restoreReason)?.label ?? ''}”`
                      : ''}
                    {revision.acceptedBy ? `, accepted by ${nameOf(revision.acceptedBy)}` : ''}
                    {' · '}
                    <span className="tabular-nums">
                      {revision.wordCount.toLocaleString('en-GB')} words
                    </span>
                  </p>
                  {/* FR-13.6 — every version is fingerprinted when it is
                      written; the fingerprint is the record, so it is shown,
                      and its writer can point anyone at the public record of
                      it, which offers the PDF (item 8.12). Neither was
                      anywhere on screen until the 2026-10-16 spec review. */}
                  <p className="mt-1 text-[11.5px] text-ink-faint">
                    <span title={`The whole fingerprint: ${revision.contentHash}`}>
                      Fingerprint{' '}
                      <span className="font-mono">{revision.contentHash.slice(0, 16)}…</span>
                    </span>
                    {mine ? (
                      <>
                        {' · '}
                        <a href={`/proof/${revision.id}`} className="text-pencil hover:underline">
                          Proof that you wrote this
                        </a>
                      </>
                    ) : null}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1.5 text-[12.5px] text-ink-soft">
                    <input
                      type="checkbox"
                      checked={picked.includes(revision.id)}
                      onChange={() => pick(revision.id)}
                    />
                    Compare
                  </label>
                  {revision.parentId ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggle({ revisionId: revision.id, against: 'before' })}
                      aria-expanded={isOpen(comparing, revision.id, 'before')}
                    >
                      {isOpen(comparing, revision.id, 'before') ? 'Hide' : 'What changed'}
                    </Button>
                  ) : null}
                  {!isHead && head ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggle({ revisionId: revision.id, against: 'current' })}
                      aria-expanded={isOpen(comparing, revision.id, 'current')}
                    >
                      {isOpen(comparing, revision.id, 'current') ? 'Hide' : 'Compare with current'}
                    </Button>
                  ) : null}
                  {canRestore && !isHead ? (
                    <Button
                      size="sm"
                      onClick={() => setRestoring(revision.id)}
                      disabled={restore.isPending}
                    >
                      Restore this version
                    </Button>
                  ) : null}
                </div>
              </div>

              {/* FR-8.3 and FR-7. Until 2026-10-16 this was a placeholder from
                  phase 1 that only named two word counts: the comparison
                  engine arrived in phase 2 and was never wired in here, so
                  nobody could see what an accepted suggestion had changed. */}
              {isOpen(comparing, revision.id, 'before') && revision.parentId ? (
                <RevisionComparison
                  baseId={revision.parentId}
                  targetId={revision.id}
                  leftLabel="Before"
                  rightLabel="This version"
                />
              ) : null}
              {isOpen(comparing, revision.id, 'current') && head ? (
                <RevisionComparison
                  baseId={revision.id}
                  targetId={head}
                  leftLabel="This version"
                  rightLabel="Current"
                />
              ) : null}
            </li>
          )
        })}
      </ol>

      {history.hasNextPage ? (
        <div className="mt-4">
          <Button
            size="sm"
            disabled={history.isFetchingNextPage}
            onClick={() => void history.fetchNextPage()}
          >
            {history.isFetchingNextPage ? 'Reading' : 'Show older versions'}
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={restoring !== null}
        title="Restore this version?"
        confirmLabel="Restore this version"
        busy={restore.isPending || restoreImpact.isLoading}
        onCancel={() => {
          setRestoring(null)
          setReason(null)
        }}
        onConfirm={() => {
          if (restoring) {
            restore.mutate({ sectionId, revisionId: restoring, reason: reason ?? undefined })
          }
        }}
      >
        <p>
          The section goes back to saying what it said then. What it says now stays in the history,
          and can be brought back the same way.
        </p>
        <p>
          {restoreImpact.data
            ? restoreImpact.data.told.length === 0
              ? 'Nobody else’s accepted words are affected.'
              : `${listOf(restoreImpact.data.told.map(nameOf))} will be told: their accepted words leave the main draft, and their credit for them stops being live.`
            : 'Working out whose words this touches…'}
        </p>
        {/* FR-8.6 (item 8.14) — no reason is owed; one click gives one, and
            the history shows it beside the restore. */}
        <p className="text-ink">
          You do not owe anyone a reason. If you want to give one, pick the nearest.
        </p>
        <div className="flex flex-wrap gap-2">
          {PASS_CHIPS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={reason === option.value}
              onClick={() => setReason(reason === option.value ? null : option.value)}
              className={
                reason === option.value
                  ? 'rounded-control border border-pencil bg-pencil-wash px-3 py-1.5 text-[13px] text-pencil'
                  : 'rounded-control border border-rule bg-paper px-3 py-1.5 text-[13px] text-ink-soft hover:border-ink-faint'
              }
            >
              {option.label}
            </button>
          ))}
        </div>
      </ConfirmDialog>

      {restore.isError ? (
        <p role="alert" className="mt-3 text-[13px] text-crimson">
          {restore.error.message}
        </p>
      ) : null}

      <p className="mt-6 text-[13.5px]">
        <a href={backHref} className="text-pencil hover:underline">
          Back to the story
        </a>
      </p>
    </div>
  )
}

/** A version's name in a comparison: when it was written. */
function labelOf(revision: Revision | undefined, timeZone: string): string {
  return revision ? formatInZone(revision.createdAt, 'shortTime', timeZone) : 'A version'
}

/** Which comparison is open: a version against the one before it, or against the current text. */
type Comparing = { revisionId: string; against: 'before' | 'current' }

function isOpen(comparing: Comparing | null, revisionId: string, against: Comparing['against']) {
  return comparing?.revisionId === revisionId && comparing.against === against
}
