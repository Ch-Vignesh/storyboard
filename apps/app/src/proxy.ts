import NextAuth from 'next-auth'
import { NextResponse } from 'next/server'

import { authConfig } from '@/auth/config'

/**
 * Navigation only. Two jobs:
 *
 * 1. Send signed-out visitors to /signin on the routes that need an account.
 * 2. Send a half-onboarded user back to the step they left (FR-1.3), and keep a
 *    finished one out of the onboarding screens.
 *
 * Permission checks live at the data layer (NFR-6), never here. This file runs
 * on the database-free config on purpose, so it stays light; it reads only what
 * the JWT already carries.
 */
const { auth } = NextAuth(authConfig)

/** The onboarding screens, in the order FR-1.3 lists them. */
const ONBOARDING_ROUTES = ['/onboarding/username', '/onboarding/genres'] as const

export const proxy = auth((request) => {
  const { pathname, search } = request.nextUrl
  const user = request.auth?.user
  const isOnboardingRoute = ONBOARDING_ROUTES.some((route) => pathname.startsWith(route))

  if (!user) {
    // Public storyboard reading is not matched below, so anything that reaches
    // here without a session needs one (FR-1.2).
    const signIn = new URL('/signin', request.nextUrl)
    signIn.searchParams.set('next', `${pathname}${search}`)
    return NextResponse.redirect(signIn)
  }

  // Steps 1 and 2 (email, verification, password) are gated by the verification
  // link itself, so the only steps this can be missing are 3 and 4.
  const step = !user.username
    ? '/onboarding/username'
    : !user.onboarded
      ? '/onboarding/genres'
      : null

  if (step && !isOnboardingRoute) {
    return NextResponse.redirect(new URL(step, request.nextUrl))
  }
  if (step && isOnboardingRoute && !pathname.startsWith(step)) {
    // Asked for the genres step without a username, or the reverse.
    return NextResponse.redirect(new URL(step, request.nextUrl))
  }
  if (!step && isOnboardingRoute) {
    return NextResponse.redirect(new URL('/', request.nextUrl))
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    '/',
    '/onboarding/:path*',
    '/new',
    '/settings/:path*',
    '/import/:path*',
    '/admin/:path*',
    // Writing surfaces. Reading a storyboard is deliberately absent: a guest
    // may read a public one (FR-1.2), and the data layer decides the rest.
    '/s/:slug/c/:path*/edit',
    '/s/:slug/help/new',
    '/s/:slug/help/:request/write',
    '/s/:slug/settings/:path*',
  ],
}
