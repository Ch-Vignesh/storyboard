import { SHARE_IMAGE_SIZE, ShareCard } from '@storyboard/ui/brand'
import { ImageResponse } from 'next/og'

import { SITE } from '@/lib/metadata'

/**
 * Phase 14, item 9.6 — the picture a shared link shows, on every page: ruled
 * paper, the ochre margin, the blue-pencil caret and the name. One picture
 * for all of them on purpose. A picture per story would put a story's words
 * into a file that is cached and passed around apart from the page, which is
 * the one place `lib/authz` cannot follow them.
 */
export const alt = `${SITE.name}: ${SITE.line}`
export const size = SHARE_IMAGE_SIZE
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(<ShareCard line={SITE.line} />, size)
}
