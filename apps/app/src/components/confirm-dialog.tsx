'use client'

import { Button } from '@storyboard/ui/components/button'
import { useEffect, useId, useRef } from 'react'

/**
 * Phase 14, item 5.1 — the one confirmation dialog, on the native `<dialog>`
 * and `showModal`: a title, the consequences in plain words, focus starting
 * on the safe button, Escape cancelling, and a confirm button that names
 * its consequence ("Remove the chapter and 3 sections"). The consequences
 * come from the server where the server knows them; the caller fetches them
 * and writes them into `children`.
 *
 * Controlled by `open`: the caller decides when it shows and what happens
 * on either button. Nothing here commits anything.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Keep it as it is',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  children?: React.ReactNode
  confirmLabel: string
  cancelLabel?: string
  destructive?: boolean
  /** The confirm is on its way: both buttons wait. */
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const safe = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const bodyId = useId()

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) {
      element.showModal()
      safe.current?.focus()
    } else if (!open && element.open) {
      element.close()
    }
  }, [open])

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(event) => {
        // Escape: the browser would close it; the caller's state must agree.
        event.preventDefault()
        if (!busy) onCancel()
      }}
      className="m-auto w-[min(92vw,28rem)] rounded-control border border-rule bg-paper p-6 text-ink shadow-lift backdrop:bg-ink/40"
    >
      {/* Drawn only while open: a closed dialog's words would otherwise sit
          hidden in the page, found by searches and read by nobody. */}
      {open ? (
        <>
          <h2 id={titleId} className="font-manuscript text-[20px] leading-tight font-medium">
            {title}
          </h2>
          <div id={bodyId} className="mt-3 space-y-2 text-[14px] leading-relaxed text-ink-soft">
            {children}
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
            <Button ref={safe} type="button" variant="ghost" disabled={busy} onClick={onCancel}>
              {cancelLabel}
            </Button>
            <Button
              type="button"
              variant={destructive ? 'destructive' : 'primary'}
              disabled={busy}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </>
      ) : null}
    </dialog>
  )
}
