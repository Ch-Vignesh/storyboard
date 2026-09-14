'use client'

import type { ComparisonResult } from '@storyboard/compare'
import { Button } from '@storyboard/ui/components/button'
import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { ComparisonView } from '@/components/comparison-view'
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
  isStale,
  backHref,
}: {
  suggestionId: string
  state: 'DRAFT' | 'SUBMITTED' | 'ACCEPTED' | 'PASSED' | 'STALE' | 'WITHDRAWN'
  comparison: ComparisonResult
  contributorName: string
  canDecide: boolean
  isStale: boolean
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
        if (error.data?.code === 'CONFLICT') setConflict(true)
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
              This section changed a moment ago, so the comparison above is out of date. Reload to
              see where it stands, or accept anyway and this version becomes the current text.
            </p>
          ) : null}

          {!passing ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="accept"
                size="lg"
                disabled={accept.isPending}
                onClick={() =>
                  accept.mutate({ suggestionId, acknowledgedChange: conflict || isStale })
                }
              >
                {accept.isPending ? 'Accepting' : 'Accept into the main draft'}
              </Button>
              <Button variant="ghost" onClick={() => setPassing(true)}>
                Go a different way
              </Button>
              <p className="w-full text-[12.5px] leading-relaxed text-ink-faint">
                Accepting writes this into your draft and credits {contributorName} permanently.
                Your earlier version stays in the history.
              </p>
            </div>
          ) : (
            <div>
              <p className="text-[14px] text-ink">
                You do not owe anyone a reason. If you want to give one, pick the nearest.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
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
              <div className="mt-4 flex items-center gap-3">
                <Button
                  disabled={pass.isPending}
                  onClick={() => pass.mutate({ suggestionId, reason: chip ?? undefined })}
                >
                  {pass.isPending ? 'Saving' : 'Pass on this one'}
                </Button>
                <button
                  type="button"
                  className="text-[13.5px] text-ink-soft hover:text-ink"
                  onClick={() => setPassing(false)}
                >
                  Back
                </button>
              </div>
              <p className="mt-3 max-w-measure text-[12.5px] leading-relaxed text-ink-faint">
                {contributorName} will be told you went a different way. Their version stays on
                their profile and at this address.
              </p>
            </div>
          )}

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
