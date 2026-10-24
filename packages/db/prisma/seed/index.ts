/**
 * Idempotent seed (FR-15.6). Safe to run on every deploy.
 *
 *   pnpm db:seed
 *
 * Seeds reference data (genres, FR-15.6, and the kill switches of item 9.4,
 * off) and the example storyboards under prisma/seed/storyboards/, each
 * flagged `isSeed` and owned by the platform account so they are never
 * mistaken for the work of a real writer (FR-15.3).
 */
import { loadRootEnv } from '@storyboard/config/env'

import { createPrismaClient } from '../../src/client'
import { SEEDED_FLAGS, seedFlags } from './flags'
import { GENRES } from './genres'
import { seedExampleStoryboard } from './storyboards'
import { ensureSeedAccounts } from './storyboards/accounts'
import { seedLibrary } from './storyboards/seed-library'

loadRootEnv()

/**
 * One storyboard is one transaction: a few dozen statements, each a round trip.
 * The seed runs from a laptop against the hosted database (05-deployment.md),
 * and across an ocean a round trip is about 300 ms — measured against Prisma
 * Postgres on 2026-10-13 — so Prisma's 5 s default expired on the first one.
 * Getting a connection through the pooler took 2 to 4 s on the same run.
 */
const SEED_TRANSACTIONS = { maxWait: 30_000, timeout: 120_000 }

async function main(): Promise<void> {
  const prisma = createPrismaClient({ transactionOptions: SEED_TRANSACTIONS })
  try {
    let created = 0
    for (const genre of GENRES) {
      const before = await prisma.genre.findUnique({ where: { slug: genre.slug } })
      await prisma.genre.upsert({
        where: { slug: genre.slug },
        create: genre,
        update: { name: genre.name },
      })
      if (!before) created += 1
    }
    console.warn(`genres: ${String(GENRES.length)} ensured, ${String(created)} new`)

    // Item 9.4 (D-18) — the kill switches, new ones off, existing ones as they stand.
    const flags = await seedFlags(prisma)
    console.warn(
      `flags: ${String(SEEDED_FLAGS.length)} ensured, ${String(flags.created)} new, every new one off`,
    )

    // FR-15.3 — whoever owns and answers the examples, made before anything they own.
    const accounts = await ensureSeedAccounts(prisma)

    const example = await seedExampleStoryboard(prisma, accounts)
    console.warn(`example storyboard: ${example}`)

    // FR-15.1 to FR-15.4 — the launch library.
    const library = await seedLibrary(prisma, accounts)
    console.warn(
      `library: ${String(library.created)} created, ${String(library.skipped)} already present, ` +
        `${String(library.requests)} requests (${String(library.answered)} answered)` +
        // Silent when there is nothing to say, and loud when there is: a
        // corrected excerpt on a database that already had it is the one line
        // of this output somebody needs to notice (decision 0023).
        (library.corrected
          ? `\nlibrary: ${String(library.corrected)} excerpt(s) corrected to match their cited edition`
          : '') +
        // Item 9.5 — what a database seeded before the library grew was given.
        (library.extended
          ? `\nlibrary: ${String(library.extended)} section(s) added to stories already present`
          : '') +
        (library.help
          ? `\nlibrary: ${String(library.help)} suggestion(s) and idea(s) from the example helpers`
          : '') +
        // A stuck point the library names and the database could not take. On
        // a fresh database the library's own test keeps this empty.
        (library.unplaced.length
          ? `\nlibrary: not placed, their section is already asked about: ${library.unplaced.join('; ')}`
          : ''),
    )
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
