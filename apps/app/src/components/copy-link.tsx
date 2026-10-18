'use client'

import { Button } from '@storyboard/ui/components/button'
import { useEffect, useRef, useState } from 'react'

/**
 * Phase 14, item 6.11 — one control that puts a page's address on the
 * clipboard. The clipboard API where the browser allows it; a selected,
 * off-screen text field and the old copy command where it does not (an
 * insecure origin, an older browser); and a word on where the address is when
 * both fail. What happened is announced through a live region, so a screen
 * reader hears "Link copied" without the focus moving.
 */
export function CopyLink({
  path,
  label = 'Copy link',
  appearance = 'link',
}: {
  /** The address to copy, relative to this site; the page's own when absent. */
  path?: string
  label?: string
  /** `ghost` matches the buttons in the reader's menu; `link` sits in a line of text. */
  appearance?: 'link' | 'ghost'
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const settle = (next: 'copied' | 'failed') => {
    setState(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), 2500)
  }

  const copy = async () => {
    const url = new URL(path ?? window.location.pathname, window.location.origin).toString()
    try {
      await navigator.clipboard.writeText(url)
      settle('copied')
    } catch {
      settle(copyByCommand(url) ? 'copied' : 'failed')
    }
  }

  const text = state === 'copied' ? 'Link copied' : label
  return (
    <>
      {appearance === 'ghost' ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => void copy()}>
          {text}
        </Button>
      ) : (
        <button
          type="button"
          onClick={() => void copy()}
          className="text-pencil underline-offset-4 hover:underline"
        >
          {text}
        </button>
      )}
      {/* Always present, so the announcement has somewhere to land. */}
      <span role="status" aria-live="polite" className="sr-only">
        {state === 'copied'
          ? 'Link copied'
          : state === 'failed'
            ? 'The link could not be copied. The address is in the browser’s bar.'
            : ''}
      </span>
      {state === 'failed' ? (
        <span className="ml-2 text-[12.5px] text-ink-faint">
          Could not copy; the address is in the browser’s bar.
        </span>
      ) : null}
    </>
  )
}

/** The way before the clipboard API, for browsers and origins without it. */
function copyByCommand(text: string): boolean {
  const field = document.createElement('textarea')
  field.value = text
  field.setAttribute('readonly', '')
  field.style.position = 'fixed'
  field.style.opacity = '0'
  document.body.append(field)
  field.select()
  let copied = false
  try {
    copied = document.execCommand('copy')
  } catch {
    copied = false
  }
  field.remove()
  return copied
}
