'use client'

import { useState } from 'react'

/**
 * FR-9.6 — the credit lines as plain text, for a manuscript's front matter.
 *
 * The requirement names four things each line must carry — name, role, chapter,
 * date and the permanent URL — and the reason is that this text is going into a
 * book. Somebody typesetting an acknowledgements page needs to paste it and be
 * done, not retype twelve lines out of a table and introduce a typo into
 * somebody's name.
 *
 * Plain text rather than a download: the destination is a word processor, and a
 * file would be one more step between here and the page it belongs on. It is
 * shown as well as copied, because a copy button that gives no evidence of what
 * it copied is a button people press twice.
 */
export type CreditLine = {
  name: string
  role: string
  chapter: string | null
  date: string
  url: string | null
}

/** One line, with the parts that resolved and none of the ones that did not. */
function render(line: CreditLine): string {
  const parts = [`${line.name} — ${line.role}`]
  // A lineage that is no longer in the main draft has no address. The
  // contribution still stands (principle 1.3.3), so the line is written without
  // a chapter rather than dropped or given a wrong one.
  if (line.chapter) parts.push(line.chapter)
  parts.push(line.date)
  if (line.url) parts.push(line.url)
  return parts.join(' · ')
}

export function CreditLines({ title, lines }: { title: string; lines: CreditLine[] }) {
  const [copied, setCopied] = useState(false)

  if (lines.length === 0) return null

  const text = [`Contributors to ${title}`, '', ...lines.map(render)].join('\n')

  return (
    <section className="mt-10 border-t border-rule pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
          For your front matter
        </h2>
        <button
          type="button"
          className="text-[13px] text-pencil underline underline-offset-2"
          onClick={() => {
            void navigator.clipboard.writeText(text).then(
              () => {
                setCopied(true)
                setTimeout(() => {
                  setCopied(false)
                }, 2000)
              },
              () => {
                // Clipboard refused — an insecure origin, or a browser asking
                // for a permission nobody granted. The text is on the screen
                // and selectable, which is the fallback and always was.
                setCopied(false)
              },
            )
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <p className="mt-2 max-w-measure text-[13.5px] leading-relaxed text-ink-soft">
        Every contribution, as plain text. Paste it into your acknowledgements. The addresses are
        permanent, so a reader can check any line of it.
      </p>

      <pre className="mt-4 overflow-x-auto border border-rule bg-paper-sunk p-4 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap text-ink-soft">
        {text}
      </pre>
    </section>
  )
}
