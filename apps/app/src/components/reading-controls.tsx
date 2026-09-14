'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { READING_LINE_HEIGHT, READING_TYPE_SCALE } from '@/lib/schemas/constants'
import { useTRPC } from '@/trpc/client'

/**
 * NFR-5 — adjustable type size and line height, persisted per user so they
 * follow the reader between devices (decision 0009).
 *
 * The values are applied as CSS custom properties on the document root, which
 * the `.manuscript` block in globals.css reads. Doing it that way means the
 * reader re-renders nothing when the size changes: the browser reflows text and
 * that is all.
 */
export function ReadingControls() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const preferences = useQuery(trpc.user.readingPreferences.queryOptions())
  const typeScale = preferences.data?.readingTypeScale ?? READING_TYPE_SCALE.default
  const lineHeight = preferences.data?.readingLineHeight ?? READING_LINE_HEIGHT.default

  const save = useMutation(
    trpc.user.setReadingPreferences.mutationOptions({
      // Apply immediately and keep the server as the record; a reading control
      // that waits for a round trip feels broken.
      onMutate: async (next) => {
        const key = trpc.user.readingPreferences.queryKey()
        await queryClient.cancelQueries({ queryKey: key })
        const previous = queryClient.getQueryData(key)
        queryClient.setQueryData(key, (current) =>
          current
            ? {
                readingTypeScale: next.typeScale ?? current.readingTypeScale,
                readingLineHeight: next.lineHeight ?? current.readingLineHeight,
              }
            : current,
        )
        return { previous, key }
      },
      onError: (_error, _next, context) => {
        if (context) queryClient.setQueryData(context.key, context.previous)
      },
    }),
  )

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--reading-type-scale', String(typeScale / 100))
    root.style.setProperty('--reading-line-height', String(lineHeight / 100))
  }, [typeScale, lineHeight])

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="rounded-control border border-rule px-2.5 py-1 text-[13px] text-ink-soft hover:border-ink-faint hover:text-ink"
      >
        Reading
      </button>

      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-64 space-y-4 border border-rule bg-paper p-4 shadow-lift">
          <div>
            <label
              htmlFor="type-scale"
              className="flex items-baseline justify-between text-[13px] text-ink"
            >
              Type size
              <span className="text-[12px] text-ink-faint tabular-nums">{typeScale}%</span>
            </label>
            <input
              id="type-scale"
              type="range"
              className="mt-1.5 w-full accent-pencil"
              min={READING_TYPE_SCALE.min}
              max={READING_TYPE_SCALE.max}
              step={READING_TYPE_SCALE.step}
              value={typeScale}
              onChange={(event) => save.mutate({ typeScale: Number(event.target.value) })}
            />
          </div>

          <div>
            <label
              htmlFor="line-height"
              className="flex items-baseline justify-between text-[13px] text-ink"
            >
              Line spacing
              <span className="text-[12px] text-ink-faint tabular-nums">
                {(lineHeight / 100).toFixed(2)}
              </span>
            </label>
            <input
              id="line-height"
              type="range"
              className="mt-1.5 w-full accent-pencil"
              min={READING_LINE_HEIGHT.min}
              max={READING_LINE_HEIGHT.max}
              step={READING_LINE_HEIGHT.step}
              value={lineHeight}
              onChange={(event) => save.mutate({ lineHeight: Number(event.target.value) })}
            />
          </div>

          <p className="text-[12px] leading-relaxed text-ink-faint">
            Saved to your account, so it follows you to any device you read on.
          </p>
        </div>
      ) : null}
    </div>
  )
}
