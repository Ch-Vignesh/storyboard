'use client'

import { useEffect, useId, useRef, useState } from 'react'

type Breakpoint = 'sm' | 'md' | 'lg' | 'xl'

/** Full class names, because Tailwind only ships the strings it can read. */
const BUTTON_HIDDEN_FROM: Record<Breakpoint, string> = {
  sm: 'sm:hidden',
  md: 'md:hidden',
  lg: 'lg:hidden',
  xl: 'xl:hidden',
}
const WIDE_ROW: Record<Breakpoint, string> = {
  sm: 'sm:contents',
  md: 'md:contents',
  lg: 'lg:contents',
  xl: 'xl:contents',
}
const WIDE_HIDDEN: Record<Breakpoint, string> = {
  sm: 'sm:hidden',
  md: 'md:hidden',
  lg: 'lg:hidden',
  xl: 'xl:hidden',
}

/**
 * Phase 14, items 4.2 and 4.3 — links folded behind one button below a
 * breakpoint. The site header folds below `sm` behind "Menu"; the reader's
 * actions fold below `xl` behind "More", and its chapter list opens below
 * `lg` behind "Chapters".
 *
 * From the breakpoint up the wrapper is either `contents`, so the children
 * lay out in the parent's own row as if this were not here (`wide="row"`),
 * or gone altogether, because something else shows them there
 * (`wide="hidden"`, the reader's rail).
 *
 * A disclosure, not a dialog: `aria-expanded` and `aria-controls` on the
 * button, Escape closes it and puts focus back on the button, and a link or
 * submit followed closes it because the page changes. No library, because
 * there is nothing here a library would do better.
 */
export function HeaderMenu({
  children,
  label = 'Menu',
  from = 'sm',
  panel = 'dropdown',
  wide = 'row',
  buttonClassName = 'text-[13.5px] text-ink-soft hover:text-ink',
}: {
  children: React.ReactNode
  label?: string
  from?: Breakpoint
  /** A panel under the header bar, or one in the flow of the page. */
  panel?: 'dropdown' | 'inline'
  wide?: 'row' | 'hidden'
  buttonClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      button.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const wideClass = wide === 'row' ? WIDE_ROW[from] : WIDE_HIDDEN[from]
  const openClass =
    panel === 'dropdown'
      ? 'absolute inset-x-0 top-full z-20 flex flex-col items-start gap-3 border-b border-rule bg-paper px-6 py-4'
      : 'mt-4 flex flex-col items-start gap-2 border border-rule bg-paper p-4'

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`${buttonClassName} ${BUTTON_HIDDEN_FROM[from]}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((was) => !was)}
      >
        {label}
      </button>
      <div
        id={panelId}
        className={open ? `${openClass} ${wideClass}` : `hidden ${wideClass}`}
        onClick={(event) => {
          // A link followed, or a form submitted: the page is about to change.
          if ((event.target as HTMLElement).closest('a, button[type="submit"]')) setOpen(false)
        }}
      >
        {children}
      </div>
    </>
  )
}
