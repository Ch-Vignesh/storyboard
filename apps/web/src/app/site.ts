/**
 * Phase 14, items 9.6 and 9.7 — what the marketing site says about itself in
 * every place that is not the page: the tab, a link preview, a home screen.
 */
export const SITE = {
  name: 'Draftboard',
  description:
    'Post the passage you are stuck on. Other writers propose prose. You accept one, with permanent credit.',
  /** The headline of the page, which is also what a shared link says. */
  line: 'Stuck on chapter four? Ask a writer.',
  /** Where it is served. Unset in development, where it is the dev server. */
  url: process.env.NEXT_PUBLIC_MARKETING_URL ?? 'http://localhost:3201',
} as const
