import { APPLE_ICON_SIZE, PALETTE } from '@storyboard/ui/brand'
import type { MetadataRoute } from 'next'

import { SITE } from '@/lib/metadata'

/**
 * Phase 14, item 9.7 — what a phone needs to put Draftboard on a home screen:
 * the name, the icons and the paper colour behind them.
 *
 * `display: 'browser'` on purpose. There is no service worker and nothing
 * works offline, so opening it from a home screen opens the browser, with its
 * address bar and back button, rather than a window pretending to be an app.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE.name,
    short_name: SITE.name,
    description: SITE.description,
    start_url: '/',
    display: 'browser',
    background_color: PALETTE.paper,
    theme_color: PALETTE.paper,
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      {
        src: '/apple-icon',
        sizes: `${String(APPLE_ICON_SIZE)}x${String(APPLE_ICON_SIZE)}`,
        type: 'image/png',
      },
    ],
  }
}
