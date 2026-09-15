import type { MetadataRoute } from 'next'

import { env } from '@/env'

/**
 * What a crawler may index on the application (phase 8).
 *
 * Reading is the one thing that should be findable: a published storyboard, a
 * profile, the browse page and the rules. Everything else on this host is
 * either somebody's account or an action, and an indexed action URL is how a
 * crawler ends up following a link that changes something.
 *
 * This is not a permission boundary — `lib/authz` is, and an unpublished
 * storyboard answers 404 to a stranger whatever a robots file says. It is a
 * request, and it keeps private drafts out of a search index in the ordinary
 * case where somebody pastes a link somewhere public.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/'],
        disallow: [
          '/api/',
          '/settings',
          '/notifications',
          '/onboarding/',
          '/signin',
          '/signup',
          '/verify',
          '/admin',
          '/import',
          '/new',
          // Every write surface inside a storyboard. The reader itself stays
          // indexable; the editor, the request composer and the history are the
          // same content behind an action.
          '/s/*/edit',
          '/s/*/help/*/write',
          '/s/*/settings',
          '/s/*/compare',
        ],
      },
    ],
    sitemap: `${env.NEXT_PUBLIC_APP_URL}/sitemap.xml`,
    host: env.NEXT_PUBLIC_APP_URL,
  }
}
