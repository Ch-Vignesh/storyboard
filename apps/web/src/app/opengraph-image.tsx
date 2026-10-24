import { SHARE_IMAGE_SIZE, ShareCard } from '@storyboard/ui/brand'
import { ImageResponse } from 'next/og'

import { SITE } from './site'

/**
 * Phase 14, item 9.6 — the picture a link to the front page shows: the same
 * sheet as the application's, so a link to either reads as the same product.
 */
export const alt = `${SITE.name}: ${SITE.line}`
export const size = SHARE_IMAGE_SIZE
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(<ShareCard line={SITE.line} />, size)
}
