import type { Metadata } from 'next'
import Link from '@/components/link'

import { requireSession } from '@/auth/require-session'
import { PASS_CHIPS, suggestionStateLabel } from '@/lib/schemas/help'
import { caller } from '@/trpc/server'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Your suggestions' }

/**
 * FR-9.1, FR-11.1 — everything a helper has sent, and where each stands.
 *
 * The dashboard shows only news, and the profile only what was credited or
 * passed, so a suggestion still waiting could be found again only through the
 * request it was sent to. `suggestion.listMine` existed for this page and had
 * no caller until the 2026-10-16 spec review.
 */
export default async function YourSuggestionsPage() {
  await requireSession()
  const suggestions = await caller.suggestion.listMine()

  return (
    <main id="main" className="mx-auto max-w-2xl px-6 py-12">
      <nav className="mb-6 text-[12.5px] text-ink-faint">
        <Link href="/" className="hover:text-ink hover:underline">
          Your dashboard
        </Link>
      </nav>

      <h1 className="font-manuscript text-[28px] leading-tight font-medium text-ink">
        Your suggestions
      </h1>
      <p className="mt-3 max-w-measure text-[14.5px] leading-relaxed text-ink-soft">
        Everything you have sent, newest first, and where each one stands.
      </p>

      {suggestions.length === 0 ? (
        <p className="mt-8 border border-rule bg-paper-sunk px-6 py-10 text-center text-[14px] text-ink-soft">
          Nothing sent yet. When you write for someone&rsquo;s passage, it is kept here.{' '}
          <Link href="/browse" className="text-pencil hover:underline">
            Find a passage that needs help
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-8 divide-y divide-rule border-y border-rule">
          {suggestions.map((suggestion) => {
            const path = `/s/${suggestion.request.storyboard.slug}/help/${suggestion.request.publicId}/s/${suggestion.publicId}`
            const chip = PASS_CHIPS.find((entry) => entry.value === suggestion.passReason)
            return (
              <li key={suggestion.id} className="py-4">
                <Link href={path} className="-mx-3 block rounded-control px-3 hover:bg-paper-sunk">
                  <p className="font-manuscript text-[17px] text-ink">{suggestion.request.title}</p>
                  <p className="mt-1 text-[12.5px] text-ink-faint">
                    {suggestion.request.storyboard.title}
                    {' · '}
                    {suggestion.wordCount.toLocaleString('en-GB')} words
                    {' · '}
                    {suggestionStateLabel(suggestion.state, suggestion.request.state)}
                    {suggestion.state === 'PASSED' && chip ? ` (${chip.label.toLowerCase()})` : ''}
                    {suggestion.submittedAt
                      ? ` · sent ${suggestion.submittedAt.toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'long',
                        })}`
                      : ''}
                  </p>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
