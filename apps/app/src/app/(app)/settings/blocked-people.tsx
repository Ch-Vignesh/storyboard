'use client'

import { Button } from '@storyboard/ui/components/button'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from '@/components/link'

import { useTRPC } from '@/trpc/client'

/** Decision 0046 (item 2.9) — the people you have blocked, and the way back for each. */
export function BlockedPeople() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { data: blocks, isPending } = useQuery(trpc.block.list.queryOptions())
  const unblock = useMutation(
    trpc.block.set.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.block.list.queryKey() })
      },
    }),
  )

  return (
    <section className="mt-12">
      <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
        Blocked people
      </h2>
      <p className="mt-2 max-w-measure text-[13.5px] leading-relaxed text-ink-soft">
        Someone you block can still read your stories. They can&rsquo;t send you suggestions or
        ideas, and you won&rsquo;t hear from them.
      </p>
      {isPending ? (
        <p className="mt-4 text-[13.5px] text-ink-faint">Reading…</p>
      ) : (blocks?.length ?? 0) === 0 ? (
        <p className="mt-3 text-[14px] text-ink-soft">
          Nobody. Blocking is on a person&rsquo;s profile, should you need it.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-rule border-y border-rule">
          {blocks?.map(({ blocked }) => {
            const name = blocked.displayName ?? blocked.username ?? 'an account with no name yet'
            return (
              <li key={blocked.id} className="flex items-center justify-between gap-4 py-3">
                <p className="min-w-0 truncate text-[14px] text-ink">
                  {blocked.username ? (
                    <Link href={`/@${blocked.username}`} className="hover:underline">
                      {name}
                    </Link>
                  ) : (
                    name
                  )}
                  {blocked.username ? (
                    <span className="text-ink-faint"> @{blocked.username}</span>
                  ) : null}
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={unblock.isPending}
                  onClick={() => unblock.mutate({ userId: blocked.id, blocked: false })}
                >
                  Unblock
                </Button>
              </li>
            )
          })}
        </ul>
      )}
      {unblock.error ? (
        <p role="alert" className="mt-2 text-[13px] text-crimson">
          {unblock.error.message}
        </p>
      ) : null}
    </section>
  )
}
