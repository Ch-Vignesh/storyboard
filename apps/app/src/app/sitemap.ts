import { prisma } from '@storyboard/db'
import type { MetadataRoute } from 'next'

import { env } from '@/env'
import { visibleStoryboardsWhere } from '@/lib/authz/guard'

/**
 * Everything a stranger may read, for search engines (phase 8).
 *
 * The important line is `visibleStoryboardsWhere(null)`: the filter is the one
 * the authorization layer already uses for a signed-out actor, not a second
 * definition of "public" written here. A sitemap that decided for itself what
 * was public would be exactly the drift NFR-6 exists to prevent — and it would
 * fail in the worst direction, by listing the address of a private draft.
 *
 * Capped, because a sitemap is a hint rather than an index and this runs on
 * request. If the library ever outgrows the cap, it wants splitting by date
 * rather than raising.
 */
const LIMIT = 5_000

export const revalidate = 3_600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const app = env.NEXT_PUBLIC_APP_URL

  const storyboards = await prisma.storyboard.findMany({
    where: visibleStoryboardsWhere(null),
    select: { slug: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take: LIMIT,
  })

  return [
    { url: `${app}/browse`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${app}/rules`, changeFrequency: 'yearly', priority: 0.3 },
    ...storyboards.map((storyboard) => ({
      url: `${app}/s/${storyboard.slug}`,
      lastModified: storyboard.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
  ]
}
