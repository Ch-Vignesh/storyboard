'use client'

import type { ComparisonResult } from '@storyboard/compare'
import { Button } from '@storyboard/ui/components/button'
import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { ComparisonView } from '@/components/comparison-view'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { PASS_CHIPS } from '@/lib/schemas/help'
import { useTRPC } from '@/trpc/client'

type Chip = (typeof PASS_CHIPS)[number]['value']

/**
 * The comparison, and the decision underneath it (FR-6.6, FR-6.10).
 *
 * Accepting is one button with a consequence in its name. Passing needs no
 * written reason and offers a fixed set of chips in one click — there is no
 * free-text field anywhere here, deliberately.
 */
export function DecisionPanel({
  suggestionId,
  state,
  comparison,
  contributorName,
  canDecide,
  continues,
  headRevisionId,
  backHref,
}: {
  suggestionId: string
  /** The section's text as the comparison above shows it (FR-6.6). */
  headRevisionId: string | null
  state: 'DRAFT' | 'SUBMITTED' | 'ACCEPTED' | 'PASSED' | 'STALE' | 'WITHDRAWN'
  comparison: ComparisonResult
  contributorName: string
  canDecide: boolean
  /** A "what comes next" request: accepting adds after the text (decision 0038). */
  continues: boolean
  backHref: string
}) {
  const trpc = useTRPC()
  const router = useRouter()

  const [passing, setPassing] = useState(false)
  const [chip, setChip] = useState<Chip | null>(null)
  const [conflict, setConflict] = useState(false)

  const accept = useMutation(
    trpc.suggestion.accept.mutationOptions({
      onSuccess: () => {
        router.push(backHref)
        router.refresh()
      },
      onError: (error) => {
        // FR-6.6 — show the section as it is now, so a second Accept is a
        // decision about what the author has actually seen.
        if (error.data?.code === 'CONFLICT') {
          setConflict(true)
          router.refresh()
        }
      },
    }),
  )
  const pass = useMutation(
    trpc.suggestion.pass.mutationOptions({
      onSuccess: () => {
        router.push(backHref)
        router.refresh()
      },
    }),
  )

  const undecided = state === 'SUBMITTED' || state === 'STALE'

  return (
    <div>
      <ComparisonView
        result={comparison}
        leftLabel="The current text"
        rightLabel={`${contributorName}'s version`}
      />

      {canDecide && undecided ? (
        <div className="mt-10 border-t border-rule pt-6">
          {conflict ? (
            // FR-6.6 — someone else changed the section while this page was open.
            <p className="mb-4 border-l-2 border-ochre bg-ochre-wash px-4 py-3 text-[13.5px] leading-relaxed text-ink">
              This section changed a moment ago. The comparison above now shows it as it is. Look
              again, and accept if you still want this.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="accept"
              size="lg"
              disabled={accept.isPending}
              onClick={() => accept.mutate({ suggestionId, acknowledgedHeadId: headRevisionId })}
            >
              {accept.isPending ? 'Accepting' : 'Accept into the main draft'}
            </Button>
            <Button variant="ghost" onClick={() => setPassing(true)}>
              Go a different way
            </Button>
            <p className="w-full text-[12.5px] leading-relaxed text-ink-faint">
              {continues
                ? `Accepting adds this after the end of the section and credits ${contributorName} permanently. What you wrote before it stays as it is.`
                : `Accepting writes this into your draft and credits ${contributorName} permanently. Your earlier version stays in the history.`}
            </p>
          </div>

          {/* Item 5.6 (FR-6.10) — passing asks first: the four optional chips,
              each one click, and a button that names what it does. */}
          <ConfirmDialog
            open={passing}
            title="Go a different way?"
            confirmLabel="Pass on it"
            busy={pass.isPending}
            error={pass.error}
            onCancel={() => setPassing(false)}
            onConfirm={() => pass.mutate({ suggestionId, reason: chip ?? undefined })}
          >
            <p>
              {contributorName} will be told you went a different way. Their version stays on their
              profile and at this address.
            </p>
            <p className="text-ink">
              You do not owe anyone a reason. If you want to give one, pick the nearest.
            </p>
            <div className="flex flex-wrap gap-2">
              {PASS_CHIPS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={chip === option.value}
                  onClick={() => setChip(chip === option.value ? null : option.value)}
                  className={
                    chip === option.value
                      ? 'rounded-control border border-pencil bg-pencil-wash px-3 py-1.5 text-[13px] text-pencil'
                      : 'rounded-control border border-rule bg-paper px-3 py-1.5 text-[13px] text-ink-soft hover:border-ink-faint'
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          </ConfirmDialog>

          {accept.isError && !conflict ? (
            <p role="alert" className="mt-3 text-[13px] text-crimson">
              {accept.error.message}
            </p>
          ) : null}
          {pass.isError ? (
            <p role="alert" className="mt-3 text-[13px] text-crimson">
              {pass.error.message}
            </p>
          ) : null}
        </div>
      ) : null}

      {state === 'ACCEPTED' ? (
        <p className="mt-10 border-t border-rule pt-6 text-[14px] text-moss">
          This was accepted into the main draft. {contributorName} is credited.
        </p>
      ) : null}
    </div>
  )
}
