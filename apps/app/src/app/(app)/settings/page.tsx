import type { Metadata } from 'next'

import { HydrateClient, prefetch, trpc } from '@/trpc/server'

import { SettingsForm } from './settings-form'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Settings' }

/** Screen 16 — account, genres, notifications, reading. */
export default function SettingsPage() {
  prefetch(trpc.settings.get.queryOptions())
  prefetch(trpc.user.genres.queryOptions())

  return (
    <HydrateClient>
      <main id="main" className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="font-manuscript text-[28px] leading-tight font-medium text-ink">Settings</h1>
        <SettingsForm />
      </main>
    </HydrateClient>
  )
}
