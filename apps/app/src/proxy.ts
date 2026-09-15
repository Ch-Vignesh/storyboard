import NextAuth from 'next-auth'
import { NextResponse } from 'next/server'

import { authConfig } from '@/auth/config'
import { contentSecurityPolicy, makeNonce, withObjectStore } from '@/lib/csp'
import { needsAnAccount } from '@/lib/protected-routes'

/**
 * Navigation, and the Content-Security-Policy. Three jobs:
 *
 * 1. Mint a nonce and set the CSP on every document (OD-10, phase 9).
 * 2. Send signed-out visitors to /signin on the routes that need an account.
 * 3. Send a half-onboarded user back to the step they left (FR-1.3), and keep a
 *    finished one out of the onboarding screens.
 *
 * Permission checks live at the data layer (NFR-6), never here. This file runs
 * on the database-free config on purpose, so it stays light; it reads only what
 * the JWT already carries.
 *
 * **Why the matcher is now everything.** It used to list the routes needing a
 * session, which read well and was exactly wrong for a CSP: a policy has to be
 * on every document, and the reader — the one page most people see — was not
 * matched. So the matcher covers every document and `NEEDS_AN_ACCOUNT` below
 * carries what the matcher used to say. The list is the same list; it moved.
 *
 * Getting that backwards is worth guarding against, so `proxy.test.ts` asserts
 * that reading a public storyboard is still not gated.
 */
const { auth } = NextAuth(authConfig)

/** The onboarding screens, in the order FR-1.3 lists them. */
const ONBOARDING_ROUTES = ['/onboarding/username', '/onboarding/genres'] as const

export const proxy = auth((request) => {
  const { pathname, search } = request.nextUrl

  // ── The policy, on every document ────────────────────────────────────────
  const nonce = makeNonce()
  const policy = withObjectStore(
    contentSecurityPolicy(nonce, { isDev: process.env.NODE_ENV === 'development' }),
    process.env.R2_ACCOUNT_ID,
  )

  /**
   * Both, and both are load-bearing. The response header is the policy the
   * browser enforces; the request header is how Next.js finds the nonce to put
   * on the scripts it injects itself. Set only the response header and every
   * page is blank, because the framework's own bootstrap is refused.
   */
  const headers = new Headers(request.headers)
  headers.set('x-nonce', nonce)
  headers.set('content-security-policy', policy)

  const withPolicy = (response: NextResponse): NextResponse => {
    response.headers.set('content-security-policy', policy)
    return response
  }

  const proceed = () => withPolicy(NextResponse.next({ request: { headers } }))

  // ── Navigation ───────────────────────────────────────────────────────────
  if (!needsAnAccount(pathname)) return proceed()

  const user = request.auth?.user
  const isOnboardingRoute = ONBOARDING_ROUTES.some((route) => pathname.startsWith(route))

  if (!user) {
    const signIn = new URL('/signin', request.nextUrl)
    signIn.searchParams.set('next', `${pathname}${search}`)
    return withPolicy(NextResponse.redirect(signIn))
  }

  // Steps 1 and 2 (email, verification, password) are gated by the verification
  // link itself, so the only steps this can be missing are 3 and 4.
  const step = !user.username
    ? '/onboarding/username'
    : !user.onboarded
      ? '/onboarding/genres'
      : null

  if (step && !isOnboardingRoute) {
    return withPolicy(NextResponse.redirect(new URL(step, request.nextUrl)))
  }
  if (step && isOnboardingRoute && !pathname.startsWith(step)) {
    // Asked for the genres step without a username, or the reverse.
    return withPolicy(NextResponse.redirect(new URL(step, request.nextUrl)))
  }
  if (!step && isOnboardingRoute) {
    return withPolicy(NextResponse.redirect(new URL('/', request.nextUrl)))
  }

  return proceed()
})

export const config = {
  matcher: [
    /*
     * Every document, and nothing that is not one.
     *
     * `api` is excluded deliberately and not merely for speed: this proxy
     * redirects a request with no session to /signin, and doing that to a tRPC
     * call would turn every unauthenticated API error into an HTML page. The
     * static headers in `next.config.ts` cover those routes instead.
     */
    '/((?!api/|_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)',
  ],
}
