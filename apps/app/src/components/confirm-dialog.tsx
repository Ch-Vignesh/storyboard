'use client'

import { Button } from '@storyboard/ui/components/button'
import { useEffect, useId, useRef, useState } from 'react'

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
  error = null,
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
  /**
   * Why the confirm, or working out its consequences, failed. Shown in the
   * dialog: the callers put it on the page behind it, where nobody saw it and
   * no screen reader said it (2026-10-26 final pass).
   */
  error?: { message: string } | null
  onConfirm: () => void
  onCancel: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const safe = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const bodyId = useId()
  // A caller's mutation keeps its last failure: the one there when the dialog
  // opened belongs to an earlier attempt, and is not said again.
  const [earlier, setEarlier] = useState<{ message: string } | null>(null)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setEarlier(error ?? null)
  }
  const shown = error && error !== earlier ? error.message : null

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

  // A dialog that opens busy, working out its consequences, has both buttons
  // disabled, and a disabled button takes no focus: the safe one gets it
  // once the dialog is ready, unless the person has moved it themselves.
  useEffect(() => {
    if (!open || busy) return
    if (!dialog.current?.contains(document.activeElement)) safe.current?.focus()
  }, [open, busy])

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
      onClose={() => {
        // Some browsers close on a second Escape whatever `onCancel` says.
        // Still open as far as the caller knows: open again while busy, else
        // tell the caller, so no dialog is stranded shut (2026-10-26).
        if (!open) return
        if (busy) dialog.current?.showModal()
        else onCancel()
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
          {shown ? (
            <p role="alert" className="mt-3 text-[13.5px] leading-relaxed text-crimson">
              {shown}
            </p>
          ) : null}
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
