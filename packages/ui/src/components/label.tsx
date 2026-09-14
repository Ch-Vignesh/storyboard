import type { ComponentProps } from 'react'

import { cn } from '../lib/cn'

function Label({ className, ...props }: ComponentProps<'label'>) {
  return (
    <label
      data-slot="label"
      className={cn('block text-[13px] font-medium text-ink-soft select-none', className)}
      {...props}
    />
  )
}

export { Label }
