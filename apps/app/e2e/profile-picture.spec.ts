import { expect, test } from '@playwright/test'
import sharp from 'sharp'

import { AVATAR } from '../src/lib/schemas/constants'
import { signUpAndOnboard } from './helpers'

/**
 * Phase 14, item 3.13 (D-5) — a profile picture: uploaded from settings,
 * shrunk to the icon, shown in the header and on the profile, and removed.
 */
test('a picture is set, shrunk, shown beside the name, and removed again', async ({ page }) => {
  const { username } = await signUpAndOnboard(page)
  const photo = await sharp({
    create: { width: 1400, height: 1000, channels: 3, background: { r: 190, g: 70, b: 40 } },
  })
    .png()
    .toBuffer()

  await page.goto('/settings')
  // Nothing yet: initials in the header, no picture anywhere.
  await expect(page.locator('header img[src*="/avatar?v="]')).toHaveCount(0)

  // Not a picture: refused, and said so.
  await page.getByLabel('Change picture').setInputFiles({
    name: 'notes.png',
    mimeType: 'image/png',
    buffer: Buffer.from('these are notes, not a picture'),
  })
  await expect(page.getByRole('status').filter({ hasText: /not a picture/iu })).toBeVisible()

  await page.getByLabel('Change picture').setInputFiles({
    name: 'me.png',
    mimeType: 'image/png',
    buffer: photo,
  })
  await expect(page.getByRole('status').filter({ hasText: 'Your picture is set.' })).toBeVisible()

  // The header shows it, and what it shows is the icon: square, the icon
  // size, WebP, a few kilobytes.
  const shown = page.locator('header img[src*="/avatar?v="]').first()
  await expect(shown).toBeVisible()
  const src = await shown.getAttribute('src')
  if (!src) throw new Error('The header picture has no source.')
  const served = await page.request.get(src)
  expect(served.headers()['content-type']).toBe('image/webp')
  const bytes = await served.body()
  expect(bytes.byteLength).toBeLessThanOrEqual(AVATAR.maxStoredBytes)
  const meta = await sharp(bytes).metadata()
  expect([meta.width, meta.height]).toEqual([AVATAR.sizePx, AVATAR.sizePx])

  // The profile too.
  await page.goto(`/@${username}`)
  await expect(page.locator('main img[src*="/avatar?v="]').first()).toBeVisible()

  // And gone again, everywhere, with the initials back.
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Remove picture' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Your picture has been removed.' }),
  ).toBeVisible()
  await expect(page.locator('header img[src*="/avatar?v="]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Remove picture' })).toHaveCount(0)
})
