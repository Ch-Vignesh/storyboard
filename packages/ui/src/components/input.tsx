import type { ComponentProps } from 'react'

import { cn } from '../lib/cn'

function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-9 w-full min-w-0 rounded-control border border-rule bg-paper px-3 text-[14px] text-ink',
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

export { Input }
