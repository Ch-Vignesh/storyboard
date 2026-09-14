import type { ComponentProps } from 'react'

import { cn } from '../lib/cn'

function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'w-full min-w-0 rounded-control border border-rule bg-paper px-3 py-2 text-[14px] text-ink',
        'field-sizing-content min-h-16 resize-y',
        'placeholder:text-ink-faint',
        'focus-visible:border-pencil focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pencil',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-crimson',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
