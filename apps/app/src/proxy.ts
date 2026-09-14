import NextAuth from 'next-auth'

import { authConfig } from '@/auth/config'

/**
 * Sends signed-out visitors to /signin on the routes below. This is a
 * convenience for navigation only: permission checks live at the data layer
 * (NFR-6), never here.
 *
 * Built from the database-free config so this file stays light; Next.js
 * requires the export to be a plain named export, hence the re-export form.
 */
const { auth } = NextAuth(authConfig)

export { auth as proxy }

export const config = {
  matcher: ['/', '/settings/:path*', '/import/:path*', '/admin/:path*'],
}
