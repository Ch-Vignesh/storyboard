/**
 * Idempotent seed (FR-15.6). Safe to run on every deploy.
 *
 *   pnpm db:seed
 *
 * Phase 0 seeds reference data only (genres). Later phases add example
 * storyboards under prisma/seed/storyboards/, each flagged `isSeed` and owned
 * by the platform account so they are never mistaken for the work of a real
 * writer (FR-15.3).
 */
import { loadRootEnv } from '@storyboard/config/env'

import { createPrismaClient } from '../../src/client'
import { GENRES } from './genres'

loadRootEnv()

async function main(): Promise<void> {
  const prisma = createPrismaClient()
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
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
