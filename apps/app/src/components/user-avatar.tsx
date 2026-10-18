import { cn } from '@storyboard/ui/cn'

import { avatarSrc, type Person } from '@/lib/people'

import { AVATAR_SIZES, type AvatarSize, InitialsAvatar } from './initials-avatar'

/**
 * Phase 14, item 3.13 (D-5) — a person's picture, or their initials when they
 * have none. Decorative either way (`alt=""`): the name is written beside it
 * wherever this is used, which is the rule, not a habit.
 *
 * A plain `img`, not `next/image`: the file is already the icon it is drawn
 * as, a few kilobytes, served by this app from `/u/[username]/avatar` with a
 * version in the URL and a year-long cache. There is nothing left to optimise.
 */
export function UserAvatar({
  person,
  size = 'md',
  className,
}: {
  person: Person
  size?: AvatarSize
  className?: string
}) {
  const src = avatarSrc(person)
  if (!src) return <InitialsAvatar person={person} size={size} className={className} />
  return (
    // eslint-disable-next-line @next/next/no-img-element -- already an icon; see above
    <img
      src={src}
      alt=""
      aria-hidden
      decoding="async"
      className={cn('shrink-0 rounded-full object-cover', AVATAR_SIZES[size], className)}
    />
  )
}
