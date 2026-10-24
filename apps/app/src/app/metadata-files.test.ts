import { existsSync, readFileSync } from 'node:fs'

import { MARK, PALETTE } from '@storyboard/ui/brand'
import { describe, expect, it } from 'vitest'

import { contentSecurityPolicy } from '@/lib/csp'

import manifest from './manifest'

/**
 * Phase 14, item 9.7 — the files a tab, a home screen and a link preview
 * fetch: the icon is the mark, drawn in paths (no type to load, nothing to
 * fetch), the manifest names what exists, and the policy every document
 * carries lets the page use them.
 */
const here = (name: string) => new URL(`./${name}`, import.meta.url)

describe('the icon', () => {
  const svg = readFileSync(here('icon.svg'), 'utf8')

  it('is the mark, in the paper and pencil colours', () => {
    expect(svg).toContain(`d="${MARK.line}"`)
    expect(svg).toContain(`d="${MARK.caret}"`)
    expect(svg).toContain(PALETTE.paper)
    expect(svg).toContain(PALETTE.pencil)
  })

  it('is drawn, not written: no text, no fonts, nothing fetched', () => {
    expect(svg).not.toMatch(/<text|<image|<style|font|href=/iu)
  })
})

describe('the manifest', () => {
  const written = manifest()

  it('names the product and its colours', () => {
    expect(written.name).toBe('Draftboard')
    expect(written.short_name).toBe('Draftboard')
    expect(written.background_color).toBe(PALETTE.paper)
    expect(written.theme_color).toBe(PALETTE.paper)
  })

  it('lists only icons that exist', () => {
    const files: Record<string, string> = {
      '/icon.svg': 'icon.svg',
      '/apple-icon': 'apple-icon.tsx',
    }
    for (const icon of written.icons ?? []) {
      const file = files[icon.src]
      expect(file, icon.src).toBeDefined()
      expect(existsSync(here(file ?? '')), icon.src).toBe(true)
    }
  })
})

describe('the policy on every document', () => {
  const policy = contentSecurityPolicy('nonce', { isDev: false })

  it('lets a page show its own icons and pictures, and read its own manifest', () => {
    expect(policy).toMatch(/img-src 'self'/u)
    expect(policy).toMatch(/manifest-src 'self'/u)
  })
})
