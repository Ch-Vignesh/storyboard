import { expect, test } from '@playwright/test'

/**
 * The typefaces come from this site and load (phase 12, task 5).
 *
 * They used to be fetched from Google at build time by `next/font/google`,
 * and a build failed whenever Google answered in a shape Turbopack could not
 * read. They are in the repository now (`packages/ui/fonts`). This is what
 * would notice them silently not loading: a wrong path in `fonts.css`, or the
 * stylesheet not imported, leaves every page in the fallback face and no
 * other test would fail. Read-only, so it runs against a deployment too.
 */
test('the reader’s typefaces come from this site, and load @deployed', async ({ page }) => {
  const fonts: string[] = []
  page.on('request', (request) => {
    if (request.resourceType() === 'font') fonts.push(request.url())
  })

  await page.goto('/s/pride-and-prejudice-seedpride01')
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready
    return [...document.fonts]
      .filter((face) => face.status === 'loaded')
      .map((face) => face.family.replaceAll(/["']/gu, ''))
  })

  // The manuscript's face and the interface's.
  expect(loaded).toContain('Newsreader')
  expect(loaded).toContain('Archivo')
  expect(fonts.length).toBeGreaterThan(0)
  const here = new URL(page.url()).origin
  for (const url of fonts) expect(new URL(url).origin, url).toBe(here)
})
