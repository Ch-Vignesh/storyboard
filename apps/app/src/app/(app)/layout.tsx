import { auth } from '@/auth'
import { redirectIfSessionEnded } from '@/auth/require-session'
import { SiteHeader } from '@/components/site-header'

/**
 * Chrome for the signed-in application. The header itself is
 * `components/site-header.tsx` (phase 14, item 4.1), shared with every page
 * outside this group except the reader, which has its own, and the auth
 * screens. The skip link lives in the root layout (item 4.8), and every page
 * brings its own `<main id="main" tabIndex={-1}>`.
 */
export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth()

  // A session the server has refused goes to sign in again. The browser's own
  // session check clears the cookie on the next page.
  await redirectIfSessionEnded(session)

  return (
    <div className="min-h-screen">
      <SiteHeader session={session} />
      {children}
    </div>
  )
}
