import 'server-only'

import type { Session } from 'next-auth'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { auth } from './index'

/**
 * A session cookie the server has refused: one that signed in before a
 * password reset (decision 0036). The proxy lets it through, because it never
 * reads the database; this is the first place that can tell, so the person is
 * sent to sign in again instead of being shown the app for nobody.
 */
export async function redirectIfSessionEnded(session: Session | null): Promise<void> {
  if (session) return
  const cookieStore = await cookies()
  if (cookieStore.getAll().some((cookie) => cookie.name.includes('authjs.session-token'))) {
    redirect('/signin?ended=1')
  }
}

/**
 * For a page that needs an account, before it prefetches anything. A layout's
 * redirect does not stop its page rendering alongside it, so a page that
 * prefetched first sent an ended session's queries to the server, which
 * refused them and logged each as an error (seen in flow 11, 2026-10-16).
 */
export async function requireSession(): Promise<Session> {
  const session = await auth()
  if (session) return session
  await redirectIfSessionEnded(session)
  redirect('/signin')
}
