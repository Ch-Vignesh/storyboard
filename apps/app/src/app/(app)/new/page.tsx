import type { Metadata } from 'next'

import { HydrateClient, prefetch, trpc } from '@/trpc/server'

import { CreateStoryboardForm } from './create-storyboard-form'

/**
 * Rendered per request: it reads the session and prefetches through tRPC, both
 * of which need the incoming request. Without this Next tries to prerender it
 * at build time and fails.
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Start a storyboard' }

/** FR-2.1 — title, type, one to three genres, visibility. Everything else later. */
export default function NewStoryboardPage() {
  prefetch(trpc.user.genres.queryOptions())

  return (
    <HydrateClient>
      <div className="mx-auto max-w-xl px-6 py-14">
        <h1 className="font-manuscript text-[28px] leading-tight font-medium text-ink">
          Start a storyboard
        </h1>
        <p className="mt-3 text-[14.5px] leading-relaxed text-ink-soft">
          All of this can change later. Give it a working title and start writing.
        </p>
        <CreateStoryboardForm />
      </div>
    </HydrateClient>
  )
}
