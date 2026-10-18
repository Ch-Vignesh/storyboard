'use client'

import { Button } from '@storyboard/ui/components/button'
import { useInfiniteQuery, useMutation } from '@tanstack/react-query'
import type { inferRouterOutputs } from '@trpc/server'
import Link from '@/components/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { PASS_CHIPS } from '@/lib/schemas/help'
import type { AppRouter } from '@/server/trpc/routers/_app'
import { useTRPC } from '@/trpc/client'

type Page = inferRouterOutputs<AppRouter>['profile']['passed']

/**
 * FR-9.4 — "written but not used".
 *
 * Collapsed, labelled honestly, and visible only to its author unless they
 * choose otherwise. The requirement is explicit about why: defaulting these to
 * public would make being passed on feel punitive, which is the opposite of
 * what FR-6.10 works so hard to avoid.
 *
 * A page at a time (phase 14, item 6.10): the count on the summary is the
 * whole, and "Show older" fetches the next page by its cursor.
 */
export function PassedWork({
  username,
  initial,
  count,
  isSelf,
  isPublic,
  canToggle,
}: {
  username: string
  initial: Page
  count: number
  isSelf: boolean
  isPublic: boolean
  canToggle: boolean
}) {
  const trpc = useTRPC()
  const router = useRouter()
  const [visible, setVisible] = useState(isPublic)

  const setVisibility = useMutation(
    trpc.profile.setPassedWorkVisible.mutationOptions({
      onSuccess: (result) => {
        setVisible(result.showPassedWork)
        router.refresh()
      },
    }),
  )
  const list = useInfiniteQuery(
    trpc.profile.passed.infiniteQueryOptions(
      { username },
      {
        getNextPageParam: (page) => page.nextCursor,
        initialData: { pages: [initial], pageParams: [null] },
      },
    ),
  )
  const passed = (list.data?.pages ?? [initial]).flatMap((page) => page.items)

  // Nobody sees the section at all when it is empty.
  if (count === 0 || passed.length === 0) return null

  return (
    <section className="mt-12">
      <details className="border border-rule bg-paper-sunk">
        <summary className="cursor-pointer px-4 py-3 text-[13.5px] text-ink">
          Written but not used ({count})
          {isSelf && !visible ? (
            <span className="ml-2 text-[12px] text-ink-faint">— only you can see this</span>
          ) : null}
        </summary>

        <div className="border-t border-rule px-4 py-4">
          <p className="max-w-measure text-[13px] leading-relaxed text-ink-soft">
            Suggestions an author went a different way on. They are still writing, they are still
            yours, and they are still readable at their own addresses.
          </p>

          <ul className="mt-4 space-y-3">
            {passed.map((suggestion) => (
              <li key={suggestion.id} className="text-[13.5px]">
                <Link
                  href={`/s/${suggestion.request.storyboard.slug}/help/${suggestion.request.publicId}/s/${suggestion.publicId}`}
                  className="text-pencil hover:underline"
                >
                  {suggestion.request.title}
                </Link>
                <span className="text-ink-faint">
                  {' · '}
                  {suggestion.request.storyboard.title}
                  {' · '}
                  {suggestion.wordCount} words
                  {suggestion.passReason
                    ? ` · ${PASS_CHIPS.find((chip) => chip.value === suggestion.passReason)?.label ?? ''}`
                    : ''}
                </span>
              </li>
            ))}
          </ul>

          {list.hasNextPage ? (
            <div className="mt-4">
              <Button
                size="sm"
                disabled={list.isFetchingNextPage}
                onClick={() => void list.fetchNextPage()}
              >
                {list.isFetchingNextPage ? 'Reading' : 'Show older'}
              </Button>
            </div>
          ) : null}

          {canToggle ? (
            <div className="mt-5 border-t border-rule pt-4">
              <Button
                size="sm"
                disabled={setVisibility.isPending}
                onClick={() => setVisibility.mutate({ visible: !visible })}
              >
                {visible ? 'Make this private again' : 'Show this on my public profile'}
              </Button>
              <p className="mt-2 text-[12px] text-ink-faint">
                {visible
                  ? 'Anyone looking at your profile can see these.'
                  : 'Only you can see these.'}
              </p>
            </div>
          ) : null}
        </div>
      </details>
    </section>
  )
}
