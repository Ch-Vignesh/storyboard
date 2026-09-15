import type { MetadataRoute } from 'next'

/**
 * The marketing site is one page and exists to be found. Nothing to withhold.
 */
export default function robots(): MetadataRoute.Robots {
  const site = process.env.NEXT_PUBLIC_MARKETING_URL ?? 'http://localhost:3201'
  return {
    rules: [{ userAgent: '*', allow: '/' }],
    sitemap: `${site}/sitemap.xml`,
    host: site,
  }
}
