import type { Metadata } from 'next'

import { requireSession } from '@/auth/require-session'
import { readTimeZone } from '@/lib/dates'
import { HydrateClient, prefetch, trpc } from '@/trpc/server'

import { AccountSecurity } from './account-security'
import { BlockedPeople } from './blocked-people'
import { SettingsForm } from './settings-form'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Settings' }

/** Screen 16 — account, genres, notifications, reading. */
export default async function SettingsPage() {
  await requireSession()
  prefetch(trpc.settings.get.queryOptions())
  prefetch(trpc.user.genres.queryOptions())
  prefetch(trpc.block.list.queryOptions())
  const timeZone = await readTimeZone()

  return (
    <HydrateClient>
      <main id="main" tabIndex={-1} className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="font-manuscript text-[28px] leading-tight font-medium text-ink">Settings</h1>
        <SettingsForm timeZone={timeZone} />
        {/* Items 3.1 and 3.3: the password, and the sessions. */}
        <AccountSecurity timeZone={timeZone} />
        {/* Decision 0046 (item 2.9). */}
        <BlockedPeople />
      </main>
    </HydrateClient>
  )
}
