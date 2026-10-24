import { APPLE_ICON_SIZE, Mark } from '@storyboard/ui/brand'
import { ImageResponse } from 'next/og'

/**
 * Phase 14, item 9.7 — the home-screen icon, the same mark as the
 * application's, so the two sites read as one product.
 */
export const size = { width: APPLE_ICON_SIZE, height: APPLE_ICON_SIZE }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      <Mark size={APPLE_ICON_SIZE} />
    </div>,
    size,
  )
}
