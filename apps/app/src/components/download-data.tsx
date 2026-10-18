'use client'

import { useState } from 'react'

/**
 * Phase 14, item 3.14 — "Download your data". A fetch rather than a plain
 * link, because the route answers a refusal (one a day; signed out) as JSON,
 * and a link would open that JSON as a page. On success the file is handed
 * to the browser under the name the route chose.
 */
export function DownloadData({ className }: { className?: string }) {
  const [state, setState] = useState<'idle' | 'working' | 'done'>('idle')
  const [note, setNote] = useState<string | null>(null)

  async function download() {
    setState('working')
    setNote(null)
    try {
      const response = await fetch('/api/export/account')
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        setNote(body.error ?? 'That did not work. Try again in a moment.')
        setState('idle')
        return
      }
      const name =
        /filename="([^"]+)"/u.exec(response.headers.get('content-disposition') ?? '')?.[1] ??
        'draftboard-data.zip'
      const url = URL.createObjectURL(await response.blob())
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = name
      anchor.click()
      URL.revokeObjectURL(url)
      setState('done')
      setNote('Your download has started.')
    } catch {
      setNote('That did not work. Check your connection and try again.')
      setState('idle')
    }
  }

  return (
    <span className={className}>
      <button
        type="button"
        className="text-pencil underline-offset-2 hover:underline disabled:text-ink-faint"
        disabled={state === 'working'}
        onClick={() => void download()}
      >
        {state === 'working' ? 'Preparing your download' : 'Download your data'}
      </button>
      {note ? (
        <span role="status" className="ml-2 text-ink-soft">
          {note}
        </span>
      ) : null}
    </span>
  )
}
