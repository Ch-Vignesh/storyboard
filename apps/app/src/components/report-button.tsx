'use client'

import { Button } from '@storyboard/ui/components/button'
import { Label } from '@storyboard/ui/components/label'
import { Textarea } from '@storyboard/ui/components/textarea'
import { useMutation, useQuery } from '@tanstack/react-query'
import Link from '@/components/link'
import { useSession } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

import {
  REPORT_CATEGORIES,
  REPORT_COPY,
  TARGET_LABELS,
  type ReportTarget,
} from '@/lib/schemas/report'
import { useTRPC } from '@/trpc/client'
import { REPORT_NOTE_MAX_CHARS } from '@/lib/schemas/constants'

/**
 * FR-13.5 — reporting, from wherever the thing being reported is.
 *
 * Deliberately quiet: a small text link, not a button competing with the ones
 * that matter. A prominent report control on every card changes how a place
 * feels, and this place is asking people to show each other unfinished work.
 *
 * It says what happens afterwards, because "reported" with no further word is
 * how people end up reporting the same thing five times.
 */
export function ReportButton({
  targetType,
  targetId,
  className,
}: {
  targetType: ReportTarget
  targetId: string
  className?: string
}) {
  const trpc = useTRPC()
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<(typeof REPORT_CATEGORIES)[number]['value'] | null>(null)
  const [note, setNote] = useState('')

  const { status } = useSession()
  const pathname = usePathname()
  const report = useMutation(trpc.report.create.mutationOptions())
  // Whether this person has reported it already, so the form is not offered
  // for a report that would only be swallowed (`report.mine`, unused until
  // the 2026-10-16 spec review).
  const mine = useQuery({
    ...trpc.report.mine.queryOptions({ targetType, targetId }),
    enabled: status === 'authenticated',
  })

  if (report.data) {
    return (
      <p className={`text-[12.5px] leading-relaxed text-ink-faint ${className ?? ''}`}>
        {report.data.message}
      </p>
    )
  }

  if (mine.data?.reported) {
    return (
      <p className={`text-[12.5px] leading-relaxed text-ink-faint ${className ?? ''}`}>
        {REPORT_COPY.duplicate}
      </p>
    )
  }

  // A guest was shown the form, and the submit failed (2026-10-16 review).
  if (status === 'unauthenticated') {
    return (
      <Link
        href={`/signin?next=${encodeURIComponent(pathname)}`}
        className={`text-[12.5px] text-ink-faint underline-offset-4 hover:text-ink hover:underline ${className ?? ''}`}
      >
        Sign in to report {TARGET_LABELS[targetType]}
      </Link>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`text-[12.5px] text-ink-faint underline-offset-4 hover:text-ink hover:underline ${className ?? ''}`}
      >
        Report {TARGET_LABELS[targetType]}
      </button>
    )
  }

  return (
    <div className={`border-l-2 border-rule bg-paper-sunk py-3 pl-4 ${className ?? ''}`}>
      <p className="text-[13px] font-medium text-ink">
        What is wrong with {TARGET_LABELS[targetType]}?
      </p>

      <ul className="mt-2.5 space-y-1.5">
        {REPORT_CATEGORIES.map((option) => (
          <li key={option.value}>
            <label className="flex items-start gap-2.5 text-[13px] text-ink-soft">
              <input
                type="radio"
                name={`report-${targetId}`}
                value={option.value}
                checked={category === option.value}
                onChange={() => setCategory(option.value)}
                className="mt-1"
              />
              <span>
                <span className="text-ink">{option.label}</span>
                <span className="block text-[12px] text-ink-faint">{option.blurb}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div className="mt-3 space-y-1.5">
        <Label htmlFor={`note-${targetId}`} className="text-[12.5px]">
          Anything else? (optional)
        </Label>
        <Textarea
          id={`note-${targetId}`}
          rows={2}
          maxLength={REPORT_NOTE_MAX_CHARS}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Only if the category above does not cover it."
        />
      </div>

      {report.error ? (
        <p role="alert" className="mt-2 text-[12.5px] text-crimson">
          {report.error.message}
        </p>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        <Button
          size="sm"
          variant="default"
          disabled={category === null || report.isPending}
          onClick={() => {
            if (!category) return
            report.mutate({
              targetType,
              targetId,
              category,
              ...(note.trim().length > 0 ? { note: note.trim() } : {}),
            })
          }}
        >
          {report.isPending ? 'Sending…' : 'Send the report'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>

      <p className="mt-2.5 text-[12px] leading-relaxed text-ink-faint">
        A person reads every report. Nobody is told who reported what.{' '}
        <Link href="/rules" className="text-pencil hover:underline">
          The rules
        </Link>{' '}
        say what this place expects.
      </p>
    </div>
  )
}
