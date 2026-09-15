import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { auth } from '@/auth'
import { caller } from '@/trpc/server'

import { ImportFlow } from './import-flow'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Bring a manuscript in' }

/** FR-3.7 — what survives, said before the file is chosen and not after. */
const SURVIVES = [
  ['Paragraphs, italic, bold, blockquote', 'Fonts, sizes, colours, line spacing'],
  ['Headings 1 to 3', 'Tables, text boxes, embedded images'],
  ['Scene breaks', 'Headers, footers, page numbers'],
  ['Screenplay element types', 'Comments, tracked changes, revision colours'],
  ['Footnote text, at the end of its section', 'Footnote numbering and links'],
] as const

/** Screen 15 — import (FR-3). */
export default async function ImportPage() {
  const session = await auth()
  if (!session?.user) redirect('/signin?next=/import')

  const genres = await caller.user.genres()

  return (
    <main id="main" className="mx-auto max-w-2xl px-6 py-12">
      <nav className="mb-6 text-[12.5px] text-ink-faint">
        <Link href="/dashboard" className="hover:text-ink hover:underline">
          Your dashboard
        </Link>
      </nav>

      <h1 className="font-manuscript text-[28px] leading-tight font-medium text-ink">
        Bring a manuscript in
      </h1>
      <p className="mt-3 max-w-measure text-[14.5px] leading-relaxed text-ink-soft">
        Choose a file and this will propose where the chapters and sections are. You see that
        proposal and correct it before anything is saved — nothing is written until you say so.
      </p>

      {/* FR-3.7 — the table comes first, deliberately. */}
      <section className="mt-9">
        <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
          What comes across
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-y border-rule text-[13.5px]">
            <thead>
              <tr className="border-b border-rule">
                <th className="py-2 pr-4 text-left font-medium text-ink">Kept</th>
                <th className="py-2 text-left font-medium text-ink-faint">Dropped</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {SURVIVES.map(([kept, lost]) => (
                <tr key={kept}>
                  <td className="py-2 pr-4 align-top text-ink-soft">{kept}</td>
                  <td className="py-2 align-top text-ink-faint">{lost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[12.5px] leading-relaxed text-ink-faint">
          Nothing here uses a language model. The chapter detection is a list of rules, it will
          sometimes be wrong, and the review screen is how you fix it.
        </p>
      </section>

      <ImportFlow genres={genres} />
    </main>
  )
}
