import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { PALETTE } from './brand'

/**
 * Phase 14, items 9.6 and 9.7 — the icons, the manifest and the link preview
 * take colours as values, so `brand.tsx` repeats the theme's. This keeps the
 * two from drifting: a token changed in the stylesheet and not there fails here.
 */
const THEME = readFileSync(new URL('./styles/globals.css', import.meta.url), 'utf8')

function token(name: string): string | undefined {
  return new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})\\s*;`, 'iu').exec(THEME)?.[1]?.toLowerCase()
}

describe('the brand palette', () => {
  it.each([
    ['paper', PALETTE.paper],
    ['paper-sunk', PALETTE.paperSunk],
    ['ink', PALETTE.ink],
    ['ink-soft', PALETTE.inkSoft],
    ['ink-faint', PALETTE.inkFaint],
    ['rule', PALETTE.rule],
    ['pencil', PALETTE.pencil],
    ['ochre', PALETTE.ochre],
  ])('--color-%s is the value the icons and previews are drawn in', (name, value) => {
    expect(token(name)).toBe(value)
  })
})
