'use client'

import { cn } from '@storyboard/ui/cn'
import { Input } from '@storyboard/ui/components/input'
import { type ComponentProps, type KeyboardEvent, useState } from 'react'

/**
 * A password field that can be read back before it is sent.
 *
 * Hidden to begin with, because a password is often typed with somebody else
 * in the room. The button shows one short word; its full name, which a screen
 * reader announces, is "Show password". That name is in hidden text rather than
 * `aria-label` so it stays the button's name and never becomes a second label
 * that also answers to "Password".
 *
 * While the password is readable, the browser is asked not to spell-check,
 * autocorrect or capitalise it: spelling services send what they check to a
 * dictionary, and a corrected password is a wrong one.
 *
 * Item 3.9 — and it says when Caps Lock is on, which is the commonest reason
 * a right password is typed wrong.
 */
export function PasswordInput({
  className,
  reveals = 'password',
  onKeyDown,
  onKeyUp,
  ...props
}: Omit<ComponentProps<'input'>, 'type'> & {
  /** What the button shows, in its full name: two fields on one form need two names. */
  reveals?: string
}) {
  const [visible, setVisible] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const watchCapsLock = (event: KeyboardEvent<HTMLInputElement>) => {
    setCapsLock(event.getModifierState('CapsLock'))
  }

  return (
    <div>
      <div className="relative">
        <Input
          {...props}
          type={visible ? 'text' : 'password'}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="none"
          className={cn('pr-16', className)}
          onKeyDown={(event) => {
            watchCapsLock(event)
            onKeyDown?.(event)
          }}
          onKeyUp={(event) => {
            watchCapsLock(event)
            onKeyUp?.(event)
          }}
        />
        <button
          type="button"
          aria-controls={props.id}
          onClick={() => setVisible((shown) => !shown)}
          className="absolute inset-y-0 right-0 rounded-control px-3 text-[12.5px] text-ink-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pencil"
        >
          {visible ? 'Hide' : 'Show'}
          <span className="sr-only"> {reveals}</span>
        </button>
      </div>
      <p aria-live="polite" className="text-[12px] text-ochre">
        {capsLock ? 'Caps Lock is on' : ''}
      </p>
    </div>
  )
}
