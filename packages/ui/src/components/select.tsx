import type { ComponentProps } from 'react'

import { cn } from '../lib/cn'

/**
 * A native select. Deliberately not a Radix listbox: this is paper, the options
 * are short, and the platform control is keyboard- and screen-reader-correct
 * for free (NFR-4).
 */
function Select({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      data-slot="select"
      className={cn(
        'h-9 w-full min-w-0 rounded-control border border-rule bg-paper px-2.5 text-[14px] text-ink',
        'focus-visible:border-pencil focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pencil',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-crimson',
        className,
      )}
      {...props}
    />
  )
}

export { Select }
