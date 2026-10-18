import { cn } from '@storyboard/ui/cn'

import { initialsOf, toneIndexOf, type Person } from '@/lib/people'

/** Drawn at these sizes and no others, so the type inside fits. */
export const AVATAR_SIZES = {
  sm: 'size-6 text-[10px]',
  md: 'size-8 text-[12px]',
  lg: 'size-12 text-[17px]',
  xl: 'size-24 text-[34px]',
} as const

export type AvatarSize = keyof typeof AVATAR_SIZES

/**
 * A fixed set of tones from the design tokens; which one a person gets is
 * decided by their username, so they are the same colour everywhere.
 */
const TONES = [
  'bg-pencil/15 text-pencil',
  'bg-moss-wash text-moss',
  'bg-ochre-wash text-ochre',
  'bg-crimson/10 text-crimson',
  'bg-ink/10 text-ink-soft',
] as const

/**
 * Phase 14, item 3.13 — the picture of somebody who has none: up to two
 * initials on a tone. Decorative, and hidden from assistive technology on
 * purpose: the name is always written beside it, and reading "AL" before
 * "Ada Lovelace" helps nobody. An erased person gets an empty circle.
 */
export function InitialsAvatar({
  person,
  size = 'md',
  className,
}: {
  person: Person
  size?: AvatarSize
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-medium tracking-tight select-none',
        AVATAR_SIZES[size],
        TONES[toneIndexOf(person, TONES.length)],
        className,
      )}
    >
      {initialsOf(person)}
    </span>
  )
}
