import { APPLE_ICON_SIZE, PALETTE } from '@storyboard/ui/brand'
import type { MetadataRoute } from 'next'

import { SITE } from './site'

/**
 * Phase 14, item 9.7 — the name, the icons and the paper colour, for a home
 * screen. `display: 'browser'`, as the application's: a page to read, not an
 * app that pretends to work offline.
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
