'use client'

import { Button } from '@storyboard/ui/components/button'
import { useState } from 'react'

/** FR-9.6 — the text, and one button that puts it on the clipboard. */
export function CopyableCredits({ text, lines }: { text: string; lines: string[] }) {
  const [copied, setCopied] = useState(false)

  return (
    <div className="mt-8">
      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          onClick={() => {
            void navigator.clipboard.writeText(text).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 2500)
            })
          }}
        >
          Copy all {lines.length} lines
        </Button>
        {/* Announced, not just shown: a status change with no text is invisible
            to a screen reader (NFR-4). */}
        <span role="status" aria-live="polite" className="text-[13px] text-moss">
          {copied ? 'Copied to the clipboard.' : ''}
        </span>
      </div>

      <pre className="mt-5 max-w-full overflow-x-auto border border-rule bg-paper-sunk px-4 py-4 text-[13px] leading-relaxed whitespace-pre-wrap text-ink">
        {text}
      </pre>
    </div>
  )
}
