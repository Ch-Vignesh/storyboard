import { expect, test, type Page } from '@playwright/test'

import { signUpAndOnboard } from './helpers'

/**
 * Phase 4's exit criteria (docs/04-phase-plan.md):
 *
 * - An alternate version can be started, written in, and promoted to the main
 *   draft without losing the draft it replaced (FR-10.1, FR-10.2).
 * - A reader can spin a public storyboard off, the spin-off carries the credits
 *   it inherited (FR-9.5), the original lists it (FR-10.6), and the spin-off
 *   says where it came from (FR-10.4).
 *
 * Everything goes through the interface. A spin-off proved by a database query
 * would prove only that the query works.
 */

/** Creates a public storyboard with one written section. Returns its path. */
async function writeAStoryboard(page: Page, title: string) {
  await page.goto('/new')
  await page.getByLabel('Title').fill(title)
  await page.getByRole('button', { name: 'Literary fiction', exact: true }).click()
  await page.getByRole('button', { name: /create and start writing/i }).click()
  await expect(page).toHaveURL(/\/s\//)
  const path = new URL(page.url()).pathname

  await page.getByRole('link', { name: 'Edit' }).first().click()
  const editor = page.getByRole('textbox', { name: /section text/i })
  await editor.click()
  await editor.pressSequentially('The harbour had been empty for a year before she noticed.')
  await page.getByRole('button', { name: /save now/i }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()

  return path
}

test('an author tries a different draft and makes it the main one', async ({ page }) => {
  await signUpAndOnboard(page)
  const path = await writeAStoryboard(page, 'The ship never lands')

  await page.goto(path)
  await page.getByRole('link', { name: 'Versions' }).click()
  await expect(page).toHaveURL(/\/versions$/)

  // FR-2.2 — one version exists from the start, and it is the main draft.
  const versions = page.getByRole('listitem')
  await expect(versions).toHaveCount(1)
  await expect(versions.first()).toContainText('Main draft')
  await expect(versions.first()).toContainText('11 words')

  // FR-10.1 — a copy of the whole tree at the current head.
  await versions
    .first()
    .getByRole('button', { name: /start another from this/i })
    .click()
  await page.getByLabel(/a name for the new version/i).fill('The other ending')
  await page.getByRole('button', { name: /start it/i }).click()

  await expect(versions).toHaveCount(2)
  const alternate = versions.filter({ hasText: 'The other ending' })
  // The copy starts identical — the head revision is shared, not duplicated
  // (decision 0014). If this reads 0 words the copy silently lost the prose.
  await expect(alternate).toContainText('11 words')

  // Write something different in the alternate.
  await alternate.getByRole('link', { name: 'The other ending' }).click()
  await expect(page).toHaveURL(/\?version=/)
  await expect(page.getByText(/you are reading the other ending/i)).toBeVisible()

  await page.getByRole('link', { name: 'Edit' }).first().click()
  const editor = page.getByRole('textbox', { name: /section text/i })
  await editor.click()
  await editor.press('Control+A')
  await editor.pressSequentially('The harbour filled overnight and nobody could say with what.')
  await page.getByRole('button', { name: /save now/i }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()

  // FR-7.5 — the two versions, side by side, differing in one section.
  await page.goto(`${path}/compare`)
  await expect(page.getByRole('heading', { name: /compare versions/i })).toBeVisible()
  await expect(page.getByText('Rewritten').first()).toBeVisible()

  // FR-10.2 — promotion, and the promise made before the button is pressed.
  await page.goto(`${path}/versions`)
  await versions
    .filter({ hasText: 'The other ending' })
    .getByRole('button', { name: /make main draft/i })
    .click()
  await expect(page.getByText(/stays here as an alternate/i)).toBeVisible()
  await page.getByRole('button', { name: /make it the main draft/i }).click()

  // The badge itself, not the confirmation copy that also says these words.
  await expect(
    versions.filter({ hasText: 'The other ending' }).getByText('Main draft', { exact: true }),
  ).toBeVisible()
  // Nothing was discarded: the draft it replaced is still listed, still readable.
  await expect(versions).toHaveCount(2)
  // The draft it replaced is still there, and is now the one addressed by
  // name rather than by the storyboard's own address. It keeps the name its
  // author gave it: renaming somebody's draft to tidy up an adjective would be
  // worse than the momentary confusion of a version called 'Main draft'.
  await expect(
    versions.filter({ hasText: '11 words' }).getByRole('link', { name: 'Main draft' }),
  ).toHaveAttribute('href', /\?version=/)

  await page.goto(path)
  await expect(page.getByText(/the harbour filled overnight/i)).toBeVisible()
})

test('a reader spins off a public storyboard and keeps its credits', async ({ browser }) => {
  // The author writes something public.
  const authorContext = await browser.newContext()
  const authorPage = await authorContext.newPage()
  const author = await signUpAndOnboard(authorPage)
  const path = await writeAStoryboard(authorPage, 'The lighthouse keeps time')

  // Somebody else reads it and takes it somewhere of their own.
  const readerContext = await browser.newContext()
  const readerPage = await readerContext.newPage()
  await signUpAndOnboard(readerPage)

  await readerPage.goto(path)
  await readerPage.getByRole('link', { name: /contributors/i }).click()
  await readerPage.goto(`${path}/lineage`)
  await expect(readerPage.getByText(/nobody has spun this story off yet/i)).toBeVisible()

  // FR-10.3 — no permission is asked for, and the copy is honest about itself.
  await readerPage.getByRole('button', { name: /start my own version/i }).click()
  await readerPage.getByLabel(/what will you call yours/i).fill('The lighthouse stops')
  await expect(readerPage.getByText(/your version starts private/i)).toBeVisible()
  await readerPage.getByRole('button', { name: /start my own version/i }).click()

  await expect(readerPage).toHaveURL(/\/s\/the-lighthouse-stops-/)
  const spinOffPath = new URL(readerPage.url()).pathname

  // FR-10.3 — the prose came with it.
  await expect(readerPage.getByText(/the harbour had been empty for a year/i)).toBeVisible()

  // FR-10.4 — the banner, and its admission that it is not tracking.
  await expect(readerPage.getByText(/spun off from/i)).toBeVisible()
  await expect(readerPage.getByRole('link', { name: 'The lighthouse keeps time' })).toBeVisible()

  // FR-10.5 — the chain, from the spin-off's side.
  await readerPage.goto(`${spinOffPath}/lineage`)
  await expect(
    readerPage.getByRole('heading', { name: /where this story came from/i }),
  ).toBeVisible()
  await expect(readerPage.getByText(author.username)).toBeVisible()

  // The reader writes three sections of their own, as the exit criterion asks.
  await readerPage.goto(spinOffPath)
  for (const sentence of [
    'She counted the lamp turns until they stopped agreeing with the clock.',
    'By the second week the keeper had stopped writing the log.',
    'The mainland sent nobody, which was itself an answer.',
  ]) {
    await readerPage.getByRole('link', { name: 'Edit' }).first().click()
    const editor = readerPage.getByRole('textbox', { name: /section text/i })
    await editor.click()
    await editor.press('Control+A')
    await editor.pressSequentially(sentence)
    await readerPage.getByRole('button', { name: /save now/i }).click()
    await expect(readerPage.getByText('Saved', { exact: true })).toBeVisible()
    await readerPage.getByRole('link', { name: /back to the storyboard/i }).click()
  }

  // FR-10.6 — the original knows, and the author cannot make it go away. The
  // spin-off is private, so it is counted rather than named.
  await authorPage.goto(`${path}/lineage`)
  await expect(authorPage.getByText(/private draft/i)).toBeVisible()
  await expect(authorPage.getByRole('button', { name: /delete/i })).toHaveCount(0)

  await authorContext.close()
  await readerContext.close()
})
