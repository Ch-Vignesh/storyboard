import { expect, test } from '@playwright/test'

/**
 * Phase 14, items 9.6 to 9.8 — what a browser tab, a phone, a chat app's
 * link preview and a crawler get, asked for as a guest. Read-only, so it
 * runs against a deployment too.
 *
 * The rule that metadata never names a story to someone who may not read it
 * is tested where it can be tested exhaustively, in `lib/metadata.test.ts`.
 */
const STORY = '/s/pride-and-prejudice-seedpride01'

test('a guest gets the icons, the manifest and the preview picture, not a sign-in page @deployed', async ({
  request,
}) => {
  for (const [path, type] of [
    ['/icon.svg', 'image/svg+xml'],
    ['/apple-icon', 'image/png'],
    ['/opengraph-image', 'image/png'],
    ['/manifest.webmanifest', 'application/manifest+json'],
  ] as const) {
    const response = await request.get(path, { maxRedirects: 0 })
    expect(response.status(), path).toBe(200)
    expect(response.headers()['content-type'], path).toContain(type)
  }

  const manifest = (await (await request.get('/manifest.webmanifest')).json()) as {
    name: string
    short_name: string
  }
  expect(manifest.name).toBe('Draftboard')
  expect(manifest.short_name).toBe('Draftboard')
})

test('a public story previews by its title and opening, at one address @deployed', async ({
  page,
}) => {
  await page.goto(STORY)
  const head = (selector: string, attribute = 'content') =>
    page.locator(selector).first().getAttribute(attribute)

  expect(await head('link[rel="icon"]', 'href')).toMatch(/\/icon\.svg/u)
  expect(await head('link[rel="manifest"]', 'href')).toMatch(/\/manifest\.webmanifest/u)
  expect(await head('meta[property="og:title"]')).toContain('Pride and Prejudice')
  expect(await head('meta[property="og:image"]')).toMatch(/\/opengraph-image/u)
  expect(await head('meta[name="twitter:card"]')).toBe('summary_large_image')
  expect((await head('meta[name="description"]'))?.length ?? 0).toBeGreaterThan(0)
  expect(await head('link[rel="canonical"]', 'href')).toMatch(new RegExp(`${STORY}$`, 'u'))
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0)

  // A chapter's address names the chapter, and is its own canonical address.
  await page.goto(`${STORY}/c/1`)
  expect(await head('link[rel="canonical"]', 'href')).toMatch(new RegExp(`${STORY}/c/1$`, 'u'))
})

test('the history of a passage is kept out of the index @deployed', async ({ page }) => {
  await page.goto(`${STORY}/c/1/1/history`)
  expect(await page.locator('meta[name="robots"]').first().getAttribute('content')).toContain(
    'noindex',
  )
})

test('the sitemap offers the people behind public work @deployed', async ({ request }) => {
  const sitemap = await (await request.get('/sitemap.xml')).text()
  // The platform account signs the example library (FR-15.3).
  expect(sitemap).toContain('/@draftboard-examples')
})
