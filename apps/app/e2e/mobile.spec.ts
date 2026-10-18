import { expect, test, type Page } from '@playwright/test'

import { openRequest, sendSuggestion, signUpAndOnboard } from './helpers'

/**
 * Phase 14, item 4.9 — the product on a phone. Runs in the `mobile` project
 * (a Pixel 7) and nowhere else: the header folds behind Menu (4.2), the
 * reader folds behind More and opens its chapters from a button (4.3), the
 * comparison stacks (4.4), and nothing scrolls sideways.
 */
async function noSidewaysScroll(page: Page, where: string) {
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  )
  expect(fits, `${where} scrolls sideways`).toBe(true)
}

test.describe('on a phone', { tag: '@mobile' }, () => {
  test('the header folds, the reader has chapters, the comparison stacks, and nothing scrolls sideways', async ({
    page,
    browser,
  }) => {
    test.slow()
    const header = () => page.locator('header').first()

    // A guest on the library: Menu, and the ways in behind it.
    await page.goto('/browse')
    const menu = header().getByRole('button', { name: 'Menu' })
    await expect(menu).toBeVisible()
    await menu.click()
    await expect(header().getByRole('link', { name: 'Create an account' })).toBeVisible()
    await noSidewaysScroll(page, '/browse')

    // A member: the dashboard and settings fit.
    await signUpAndOnboard(page)
    await noSidewaysScroll(page, 'the dashboard')
    await page.goto('/settings')
    await noSidewaysScroll(page, 'settings')

    // A story: More holds the actions, Chapters opens the list, and it fits.
    const { path, requestPath } = await openRequest(page, 'A phone-sized story')
    await page.goto(path)
    await noSidewaysScroll(page, 'the story')
    const more = header().getByRole('button', { name: 'More' })
    await expect(more).toBeVisible()
    await expect(header().getByRole('link', { name: 'Contents' })).toBeHidden()
    await more.click()
    await expect(header().getByRole('link', { name: 'Contents' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(header().getByRole('link', { name: 'Contents' })).toBeHidden()
    const chapters = page.getByRole('button', { name: 'Chapters' })
    await expect(chapters).toBeVisible()
    await chapters.click()
    await expect(
      page.getByRole('navigation', { name: 'Chapters' }).getByRole('link').first(),
    ).toBeVisible()

    // A request fits.
    await page.goto(requestPath)
    await noSidewaysScroll(page, 'the request')

    // A helper sends a suggestion; the author compares it, in one column.
    const helperContext = await browser.newContext()
    const helperPage = await helperContext.newPage()
    await signUpAndOnboard(helperPage)
    await sendSuggestion(helperPage, requestPath)
    await helperContext.close()

    await page.goto(requestPath)
    await page
      .getByRole('link', { name: /read and decide/i })
      .first()
      .click()
    await page.getByRole('button', { name: /side by side/i }).click()
    const cells = page.locator('.manuscript > div')
    await expect(cells.nth(1)).toBeVisible()
    const [first, second] = await Promise.all([
      cells.nth(0).boundingBox(),
      cells.nth(1).boundingBox(),
    ])
    if (!first || !second) throw new Error('The comparison drew no cells.')
    // Stacked: the second cell sits under the first, not beside it.
    expect(Math.abs(first.x - second.x)).toBeLessThan(1)
    expect(second.y).toBeGreaterThan(first.y)
    await noSidewaysScroll(page, 'the comparison')
  })
})
