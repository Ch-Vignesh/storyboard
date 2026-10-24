'use client'

import { Button } from '@storyboard/ui/components/button'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { FLAG_CACHE_SECONDS } from '@/lib/schemas/constants'
import { formatInZone } from '@/lib/time-zone'
import { useTRPC } from '@/trpc/client'

/**
 * FR-15.5 with D-18 (phase 14, item 9.4) — the kill switches.
 *
 * Three, each pausing one way in, and each read by the code it names: the
 * list is `FEATURE_FLAG_KEYS`, and this screen switches those and nothing
 * else. It used to make flags of any name, which nothing read: a switch that
 * does nothing is worse than none, because whoever throws it in a hurry
 * believes it worked.
 */
export function FlagsPanel({ timeZone }: { timeZone: string }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { data: flags, isPending } = useQuery(trpc.admin.flags.queryOptions())

  const setFlag = useMutation(
    trpc.admin.setFlag.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.admin.flags.queryKey() })
      },
    }),
  )

  return (
    <section className="mt-12 border-t border-rule pt-8">
      <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
        Kill switches
      </h2>
      <p className="mt-2 max-w-measure text-[13.5px] leading-relaxed text-ink-soft">
        On means paused. A switch takes hold at once on the server that answers you, and everywhere
        else within {FLAG_CACHE_SECONDS} seconds.
      </p>

      {isPending ? (
        <p className="mt-4 text-[13.5px] text-ink-faint">Reading…</p>
      ) : (
        <ul className="mt-4 divide-y divide-rule border-y border-rule">
          {flags?.map((flag) => (
            <li key={flag.key} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-[13px] text-ink">
                  <span className="font-mono">{flag.key}</span>
                  <span
                    className={
                      flag.enabled
                        ? 'ml-2 border border-crimson/40 px-1.5 py-px text-[11px] tracking-wide text-crimson uppercase'
                        : 'ml-2 border border-rule px-1.5 py-px text-[11px] tracking-wide text-ink-faint uppercase'
                    }
                  >
                    {flag.enabled ? 'On' : 'Off'}
                  </span>
                </p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-faint">
                  {flag.description}
                </p>
                {flag.changedAt && flag.changedBy ? (
                  <p className="mt-0.5 text-[12px] text-ink-faint">
                    {flag.enabled ? 'Switched on' : 'Switched off'} by {flag.changedBy},{' '}
                    {formatInZone(flag.changedAt, 'dateTime', timeZone)}
                  </p>
                ) : null}
              </div>
              <Button
                size="sm"
                // Switching on stops people doing something; switching off is the undo.
                variant={flag.enabled ? 'default' : 'destructive'}
                disabled={setFlag.isPending}
                aria-label={`${flag.enabled ? 'Switch off' : 'Switch on'} ${flag.key}`}
                onClick={() => setFlag.mutate({ key: flag.key, enabled: !flag.enabled })}
              >
                {flag.enabled ? 'Switch off' : 'Switch on'}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {setFlag.error ? (
        <p role="alert" className="mt-2 text-[12.5px] text-crimson">
          {setFlag.error.message}
        </p>
      ) : null}
    </section>
  )
}
