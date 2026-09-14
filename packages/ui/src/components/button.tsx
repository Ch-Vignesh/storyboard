import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'

import { cn } from '../lib/cn'

/**
 * Buttons name their consequence ("Accept into main draft"), never a generic
 * verb. Radius 3px, paper background, hairline border; `primary` is blue
 * pencil, `accept` is moss and is reserved for accepting a suggestion.
 */
const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap',
    'rounded-control border text-[13.5px] font-medium transition-colors',
    'disabled:pointer-events-none disabled:opacity-50',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pencil',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4',
  ],
  {
    variants: {
      variant: {
        default: 'border-rule bg-paper text-ink hover:border-ink-faint',
        primary: 'border-pencil bg-pencil text-white hover:border-pencil-deep hover:bg-pencil-deep',
        accept: 'border-moss bg-moss text-white hover:border-moss-deep hover:bg-moss-deep',
        ghost: 'border-transparent bg-transparent text-ink-soft hover:bg-paper-sunk hover:text-ink',
        link: 'h-auto border-transparent bg-transparent px-0 text-pencil underline-offset-4 hover:underline',
        destructive: 'border-crimson bg-paper text-crimson hover:bg-crimson hover:text-white',
      },
      size: {
        sm: 'h-8 px-2.5 text-[13px]',
        md: 'h-9 px-3.5',
        lg: 'h-10 px-5 text-[14px]',
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
)

type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    /** Render the styles onto the child element instead of a <button>, e.g. a Link. */
    asChild?: boolean
  }

function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      // A button inside a form submits by default; make that a deliberate choice.
      {...(asChild ? {} : { type: type ?? 'button' })}
      {...props}
    />
  )
}

export { Button, buttonVariants, type ButtonProps }
