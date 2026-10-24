import { expect, test } from '@playwright/test'

/**
 * Phase 14, item 7.5 (NFR-5) — reading settings apply at once, for everyone,
 * everywhere: a guest has the controls, the next page arrives already set
 * from the server rather than jumping after load, and every page that sets a
 * manuscript follows, not only the reader.
 */
test('a guest sets the type size once, and every page arrives set', async ({ page }) => {
  const story = '/s/pride-and-prejudice-seedpride01'
  await page.goto(story)
  const manuscript = page.locator('.manuscript').first()
  await expect(manuscript).toBeVisible()
  const before = parseFloat(await manuscript.evaluate((node) => getComputedStyle(node).fontSize))

  await page.getByRole('button', { name: 'Reading' }).click()
  await expect(page.getByText('Kept on this device.')).toBeVisible()
  const size = page.getByLabel('Type size')
  await size.focus()
  // Four steps of five: 100% to 120%.
  for (let step = 0; step < 4; step += 1) await page.keyboard.press('ArrowRight')
  await expect(page.getByText('120%')).toBeVisible()
  await expect
    .poll(async () =>
      parseFloat(await manuscript.evaluate((node) => getComputedStyle(node).fontSize)),
    )
    .toBeCloseTo(before * 1.2, 1)

  // The next page is drawn at the setting by the server, before any script.
  const html = await (await page.request.get(story)).text()
  expect(html).toMatch(/--reading-type-scale:\s*1\.2\b/u)

  // A request's page sets its ask as a manuscript, and follows too.
  const request = page.locator('a[href*="/help/"]:not([href$="/help/new"])').first()
  const requestPath = (await request.count()) ? await request.getAttribute('href') : null
  if (requestPath) {
    await page.goto(requestPath)
    await expect
      .poll(async () =>
        parseFloat(
          await page
            .locator('.manuscript')
            .first()
            .evaluate((node) => getComputedStyle(node).fontSize),
        ),
      )
      .toBeCloseTo(before * 1.2, 1)
  }
})
