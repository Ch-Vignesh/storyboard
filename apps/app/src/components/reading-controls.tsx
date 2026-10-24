'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { applyReading, type Reading } from '@/lib/reading'
import { READING_LINE_HEIGHT, READING_TYPE_SCALE } from '@/lib/schemas/constants'
import { useTRPC } from '@/trpc/client'

/**
 * NFR-5 — adjustable type size and line height, persisted per user so they
 * follow the reader between devices (decision 0009).
 *
 * The values are custom properties on the document root, which the
 * `.manuscript` block in globals.css reads, so the reader re-renders nothing
 * when the size changes: the browser reflows text and that is all.
 *
 * Phase 14, item 7.5 — the page arrives already set, from the `reading` cookie
 * the root layout reads, and `initial` is that same value, so nothing is
 * applied on load and the text no longer jumps. A guest gets the controls
 * too, kept on this device; a signed-in reader's account is the record, and a
 * device that has not seen their setting yet takes it once, when it arrives.
 */
export function ReadingControls({ initial, signedIn }: { initial: Reading; signedIn: boolean }) {
  const trpc = useTRPC()
  const [open, setOpen] = useState(false)
  // What this person chose on this page, if anything; until then, their
  // account's setting once it arrives, and the page's own before that.
  const [chosen, setChosen] = useState<Reading | null>(null)

  const saved = useQuery({
    ...trpc.user.readingPreferences.queryOptions(),
    enabled: signedIn,
  })
  const save = useMutation(trpc.user.setReadingPreferences.mutationOptions())
  const accountScale = saved.data?.readingTypeScale
  const accountHeight = saved.data?.readingLineHeight
  const account =
    accountScale === undefined || accountHeight === undefined
      ? null
      : { typeScale: accountScale, lineHeight: accountHeight }
  const reading = chosen ?? account ?? initial

  useEffect(() => {
    if (chosen || accountScale === undefined || accountHeight === undefined) return
    // Only when this device's copy differs: otherwise there is nothing to do.
    if (accountScale === initial.typeScale && accountHeight === initial.lineHeight) return
    applyReading({ typeScale: accountScale, lineHeight: accountHeight })
  }, [chosen, accountScale, accountHeight, initial.typeScale, initial.lineHeight])

  function change(next: Partial<Reading>) {
    const value = { ...reading, ...next }
    setChosen(value)
    // Applied at once; a reading control that waits for a round trip feels
    // broken. A save that fails leaves this device set, which is still right.
    applyReading(value)
    if (signedIn) save.mutate(next)
  }

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
              <span className="text-[12px] text-ink-faint tabular-nums">{reading.typeScale}%</span>
            </label>
            <input
              id="type-scale"
              type="range"
              className="mt-1.5 w-full accent-pencil"
              min={READING_TYPE_SCALE.min}
              max={READING_TYPE_SCALE.max}
              step={READING_TYPE_SCALE.step}
              value={reading.typeScale}
              onChange={(event) => {
                change({ typeScale: Number(event.target.value) })
              }}
            />
          </div>

          <div>
            <label
              htmlFor="line-height"
              className="flex items-baseline justify-between text-[13px] text-ink"
            >
              Line spacing
              <span className="text-[12px] text-ink-faint tabular-nums">
                {(reading.lineHeight / 100).toFixed(2)}
              </span>
            </label>
            <input
              id="line-height"
              type="range"
              className="mt-1.5 w-full accent-pencil"
              min={READING_LINE_HEIGHT.min}
              max={READING_LINE_HEIGHT.max}
              step={READING_LINE_HEIGHT.step}
              value={reading.lineHeight}
              onChange={(event) => {
                change({ lineHeight: Number(event.target.value) })
              }}
            />
          </div>

          <p className="text-[12px] leading-relaxed text-ink-faint">
            {signedIn
              ? 'Saved to your account, so it follows you to any device you read on.'
              : 'Kept on this device. Sign in and it follows you to any device you read on.'}
          </p>
        </div>
      ) : null}
    </div>
  )
}
