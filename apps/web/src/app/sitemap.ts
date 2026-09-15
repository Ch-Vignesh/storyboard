import type { MetadataRoute } from 'next'

/** One page, and the sections a search result might reasonably deep-link to. */
export default function sitemap(): MetadataRoute.Sitemap {
  const site = process.env.NEXT_PUBLIC_MARKETING_URL ?? 'http://localhost:3201'
  return [{ url: site, changeFrequency: 'monthly', priority: 1 }]
}
