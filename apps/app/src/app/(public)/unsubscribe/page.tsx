import type { Metadata } from 'next'
import Link from '@/components/link'

import { env } from '@/env'
import { NOTIFICATIONS } from '@/lib/schemas/notifications'
import { readUnsubscribe, scopeLabels } from '@/server/mail/unsubscribe'

export const metadata: Metadata = {
  title: 'Stop these emails',
  robots: { index: false, follow: false },
}

type Search = Promise<{ t?: string; done?: string }>

function listOf(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1] ?? ''}`
}

/**
 * FR-12.1, FR-12.5 (phase 14, item 2.4) — what "Stop emails like this" opens.
 * It says what will be turned off and turns it off only when the button is
 * pressed: link scanners fetch every GET in an email, and a GET must not be
 * able to change anything. No sign-in, because the token is the authority,
 * and the person may be reading on a phone that was never signed in.
 */
export default async function UnsubscribePage({ searchParams }: { searchParams: Search }) {
  const { t = '', done } = await searchParams
  const scope = readUnsubscribe(t, env.AUTH_SECRET)

  if (!scope) {
    return (
      <main id="main" tabIndex={-1} className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="font-manuscript text-[30px] leading-tight font-medium text-ink">
          This link isn&rsquo;t valid
        </h1>
        <p className="mt-3 max-w-measure text-[15px] leading-relaxed text-ink-soft">
          It may have been cut short by the email program. Every email setting is in your
          account&rsquo;s settings, once you are signed in.
        </p>
        <p className="mt-6 text-[13.5px]">
          <Link href="/settings" className="text-pencil hover:underline">
            All email settings
          </Link>
        </p>
      </main>
    )
  }

  const kinds = listOf(scopeLabels(scope, NOTIFICATIONS))

  if (done) {
    return (
      <main id="main" tabIndex={-1} className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="font-manuscript text-[30px] leading-tight font-medium text-ink">Done</h1>
        <p className="mt-3 max-w-measure text-[15px] leading-relaxed text-ink-soft">
          Email about {kinds} is off. Nothing else has changed: your notifications inside Draftboard
          continue, and so does every other kind of email you have not turned off.
        </p>
        <p className="mt-6 text-[13.5px]">
          <Link href="/settings" className="text-pencil hover:underline">
            All email settings
          </Link>
        </p>
      </main>
    )
  }

  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-manuscript text-[30px] leading-tight font-medium text-ink">
        Stop email about {kinds}?
      </h1>
      <p className="mt-3 max-w-measure text-[15px] leading-relaxed text-ink-soft">
        Nothing else changes: you keep your account, your notifications inside Draftboard, and every
        other kind of email you have not turned off.
      </p>
      <form
        method="post"
        action={`/api/unsubscribe?t=${encodeURIComponent(t)}`}
        className="mt-6 flex flex-wrap items-center gap-4"
      >
        <input type="hidden" name="from" value="page" />
        <button
          type="submit"
          className="rounded-md bg-pencil px-3.5 py-2 text-[13.5px] text-paper hover:opacity-90"
        >
          Stop these emails
        </button>
        <Link href="/settings" className="text-[13.5px] text-pencil hover:underline">
          All email settings
        </Link>
      </form>
    </main>
  )
}
