import { cache } from 'react'

import { auth } from '@/auth'
import type { AdminActor } from '@/lib/authz/admin'
import { loadAdminActor } from '@/server/admin-actor'
import { prisma } from '@storyboard/db'

/**
 * The signed-in account as `canAdmin` wants it, read once per request however
 * many of the layout and the page ask for it (item 2b.7).
 */
export const currentAdminActor = cache(async (): Promise<AdminActor> => {
  const session = await auth()
  if (!session?.user) return null
  return loadAdminActor(prisma, session.user.id)
})
