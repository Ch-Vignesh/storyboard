/**
 * `pnpm db:seed:demo` — demo data for looking at the product.
 *
 * Separate from `prisma/seed/index.ts` on purpose: this creates accounts with a
 * known password, and the production seed must not be able to do that even by
 * mistake. It refuses to run against anything that looks like a real database.
 *
 * It is idempotent: if the demo storyboard is already there it does nothing.
 * To rebuild it, recreate the development database (`pnpm db:reset`) — there is
 * deliberately no delete path here, because deleting a storyboard is one of the
 * only two things allowed to hard-delete prose (FR-8.2, decision 0008) and a
 * seed helper is not the third.
 */
import { loadRootEnv } from '@storyboard/config/env'

import { createPrismaClient } from '../../src/client'
import { DEMO_ACCOUNTS, DEMO_PASSWORD, seedDemo } from './demo'

loadRootEnv()

function refuseUnlessLocal(url: string): void {
  const host = new URL(url).hostname
  const local = host === 'localhost' || host === '127.0.0.1' || host === '::1'
  if (!local && process.env.ALLOW_REMOTE_DEMO_SEED !== 'yes-really') {
    throw new Error(
      `Refusing to write demo accounts to ${host}. These accounts share one published password.\n` +
        'If you genuinely want this on a remote database, set ALLOW_REMOTE_DEMO_SEED=yes-really.',
    )
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set.')
  refuseUnlessLocal(url)

  const prisma = createPrismaClient()
  try {
    const result = await seedDemo(prisma)
    console.warn(`demo storyboard: ${result}`)

    if (result === 'created') {
      console.warn('')
      console.warn('Demo accounts (all share the same password):')
      for (const email of DEMO_ACCOUNTS) console.warn(`  ${email}`)
      console.warn(`  password: ${DEMO_PASSWORD}`)
      console.warn('')
      console.warn('Maya owns the storyboard; Leah and Arjun have contributed to it.')
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
