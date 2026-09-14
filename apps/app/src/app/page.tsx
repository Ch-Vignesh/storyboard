import { Button } from '@storyboard/ui/components/button'

import { auth, signOut } from '@/auth'

/**
 * Dashboard placeholder. Phase 1 adds "storyboards you are writing"; phase 3
 * adds the other two regions (FR-11.1). It must never render an empty state (FR-1.5).
 */
export default async function DashboardPage() {
  const session = await auth()

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="font-manuscript text-[21px] font-medium tracking-tight">Storyboard</p>
      <h1 className="mt-10 font-manuscript text-3xl font-medium">Your dashboard</h1>
      <p className="mt-3 max-w-prose text-ink-soft">
        Signed in as {session?.user.email}. Storyboards you are writing, requests with news, and
        open requests in your genres will appear here.
      </p>
      <form
        action={async () => {
          'use server'
          await signOut({ redirectTo: '/signin' })
        }}
        className="mt-8"
      >
        <Button type="submit">Sign out</Button>
      </form>
    </main>
  )
}
