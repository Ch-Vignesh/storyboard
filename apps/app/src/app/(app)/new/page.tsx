import type { Metadata } from 'next'

import { requireSession } from '@/auth/require-session'
import { HydrateClient, prefetch, trpc } from '@/trpc/server'

import { CreateStoryboardForm } from './create-storyboard-form'

/**
 * Rendered per request: it reads the session and prefetches through tRPC, both
 * of which need the incoming request. Without this Next tries to prerender it
 * at build time and fails.
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Start a story' }

/** FR-2.1 — title, type, one to three genres, visibility. Everything else later. */
export default async function NewStoryboardPage() {
  await requireSession()
  prefetch(trpc.user.genres.queryOptions())
  // Item 3.15 — the form starts on the visibility settings chose.
  prefetch(trpc.user.me.queryOptions())

  return (
    <HydrateClient>
      <main id="main" tabIndex={-1} className="mx-auto max-w-xl px-6 py-14">
        <h1 className="font-manuscript text-[28px] leading-tight font-medium text-ink">
          Start a story
        </h1>
        <p className="mt-3 text-[14.5px] leading-relaxed text-ink-soft">
          All of this can change later. Give it a working title and start writing.
        </p>
        <CreateStoryboardForm />
      </main>
    </HydrateClient>
  )
}
