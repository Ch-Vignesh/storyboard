'use server'

import { signOut } from '@/auth'

/** The header's Sign out, shared by the site header and the reader's account menu. */
export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: '/signin' })
}
