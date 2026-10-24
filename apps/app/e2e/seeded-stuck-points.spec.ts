import { expect, test, type Page } from '@playwright/test'

/**
 * Phase 14, item 9.5 (FR-1.1, FR-15.4, D-14). "Read it" on the marketing page
 * opens The Yellow Wallpaper, and the sixty-second promise ends on a stuck
 * passage, so its first chapter has two and the story has one of each kind.
 * The example helpers' help is on them: a newcomer sees what helping looks
 * like before anybody else has helped.
 *
 * Only visits pages, so it may run against a deployment once it is seeded.
 */

const STORY = '/s/the-yellow-wallpaper-seedyellow1'

/**
 * A request's card stands in the margin on a wide screen and inline, hidden
 * there, on a narrow one (item 7.1), so a request's words are on the page
 * twice: read them in the margin.
 */
function margin(page: Page) {
  return page.getByRole('complementary', { name: 'In the margin' })
}

test.describe('the first story a visitor opens', { tag: '@deployed' }, () => {
  test('shows somebody stuck in its first chapter', async ({ page }) => {
    await page.goto(STORY)
    await expect(page.getByRole('heading', { name: 'The Yellow Wallpaper' })).toBeVisible()
    await expect(
      margin(page).getByText('She says the whole story on the first page. Is that too much?', {
        exact: true,
      }),
    ).toBeVisible()
    await expect(
      margin(page).getByText('The first sight of the paper uses up every strong word I have', {
        exact: true,
      }),
    ).toBeVisible()
  })

  test('shows what helping looks like, on the request itself', async ({ page }) => {
    // The cards follow the sections: the question on the first, the rewrite on the second.
    await page.goto(STORY)
    await page
      .getByRole('link', { name: /read what they need/i })
      .first()
      .click()
    await expect(
      page.getByRole('heading', { level: 1, name: /she says the whole story/i }),
    ).toBeVisible()
    // Ideas, from accounts that say on their profiles they are examples.
    await expect(page.getByText(/keep the bracket/i)).toBeVisible()
    await expect(page.getByText('An example contributor').first()).toBeVisible()

    await page.goto(STORY)
    await page
      .getByRole('link', { name: /read what they need/i })
      .nth(1)
      .click()
    await expect(
      page.getByRole('heading', { level: 1, name: /the first sight of the paper/i }),
    ).toBeVisible()
    // A suggestion sent and waiting on the author.
    await expect(page.getByText('Another example contributor').first()).toBeVisible()
  })

  test('asks for what comes next where the story has not been written', async ({ page }) => {
    await page.goto(`${STORY}/c/4`)
    await expect(page.getByText('This section is empty.')).toBeVisible()
    await expect(
      margin(page).getByText('One page from outside the room, after John faints', { exact: true }),
    ).toBeVisible()
  })
})
