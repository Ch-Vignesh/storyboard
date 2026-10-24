import { expect, test } from '@playwright/test'

import { signUpAndOnboard, storyPath } from './helpers'

/**
 * Critical flow 2 (architecture section 8):
 * create a storyboard -> write a section.
 *
 * The flow continues into opening a contribution request, which is phase 2.
 * It stops at the section, as the phase plan says.
 */
test('a writer creates a storyboard and writes a section', async ({ page }) => {
  await signUpAndOnboard(page)

  await page
    .getByRole('link', { name: /start a story/i })
    .first()
    .click()
  await expect(page).toHaveURL(/\/new/)

  await page.getByLabel('Title').fill('The ship never lands')
  await page.getByLabel('What is it?').selectOption('NOVEL')
  await page.getByRole('button', { name: 'Literary fiction', exact: true }).click()

  // FR-13.6 — the honest warning about copying is on the selector itself when
  // public is chosen, not behind a link.
  await expect(page.getByText(/anyone can copy what they read/i)).toBeVisible()

  await page.getByRole('button', { name: /create and start writing/i }).click()

  // FR-2.2 — never a blank slate: the main draft, one chapter, one section,
  // and (phase 14, item 8.2) the editor open on it, ready for the first word.
  await expect(page).toHaveURL(/\/s\/the-ship-never-lands-[^/]+\/c\/1\/1\/edit$/)
  const reader = await page.context().newPage()
  await reader.goto(storyPath(page))
  await expect(reader.getByRole('heading', { name: 'The ship never lands' })).toBeVisible()
  await expect(reader.getByRole('heading', { name: /chapter one/i })).toBeVisible()
  await expect(reader.getByText(/this section is empty/i)).toBeVisible()
  await reader.close()

  // Write.
  await expect(page).toHaveURL(/\/edit$/)

  const editor = page.getByRole('textbox', { name: /section text/i })
  await editor.click()
  await editor.pressSequentially('The harbour had been empty for a year before she noticed.')

  // FR-2.5 — a live word count.
  await expect(page.getByText(/\b11 words\b/)).toBeVisible()

  // FR-4.4, FR-8.3 (phase 14, item 1.4) — a formatting click is not a save.
  // Every toolbar click blurred the editor, and the blur saved a version, so
  // typing and then pressing Italic put two near-identical versions in History
  // a second apart. The draft autosave that follows the click is waited for,
  // so anything the click itself saved has landed before History is read.
  await page.keyboard.press('Control+Home')
  await page.keyboard.press('Shift+Control+ArrowRight')
  const drafted = page.waitForResponse((response) => response.url().includes('section.saveDraft'))
  await page.getByRole('button', { name: 'Italic', exact: true }).click()
  await expect(editor.locator('em')).toContainText('The')
  await drafted
  const history = await page.context().newPage()
  await history.goto(page.url().replace(/\/edit$/, '/history'))
  await expect(history.getByRole('listitem')).toHaveCount(1)
  await history.close()

  // FR-4.4 — a durable version on demand, and on blur.
  await page.getByRole('button', { name: /save now/i }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()

  // The words are in the manuscript.
  await page.getByRole('link', { name: /back to the story/i }).click()
  await expect(page.getByText(/the harbour had been empty for a year/i)).toBeVisible()

  // FR-8.2, FR-8.3 — the version is in the history, attributed and immutable.
  await page.getByRole('link', { name: 'History' }).first().click()
  await expect(page.getByRole('heading', { name: /history of/i })).toBeVisible()

  // Two versions: the empty one the storyboard was created with (FR-2.2) and
  // the one just written. The chain grows; nothing was overwritten.
  const versions = page.getByRole('listitem')
  await expect(versions).toHaveCount(2)
  await expect(versions.first()).toContainText('current')
  await expect(versions.first()).toContainText('11 words')
  await expect(versions.first()).toContainText(/written by the author/i)
  await expect(versions.last()).toContainText('0 words')

  // FR-8.4 — an earlier version can be restored; the current one cannot.
  await expect(versions.last().getByRole('button', { name: /restore this version/i })).toBeVisible()
  await expect(versions.first().getByRole('button', { name: /restore this version/i })).toHaveCount(
    0,
  )

  // FR-8.3 with FR-7 — what a version changed, shown, not described. Until
  // 2026-10-16 this was a placeholder naming two word counts, and nobody could
  // see what an accepted suggestion had put in.
  await versions.first().getByRole('button', { name: 'What changed' }).click()
  await expect(versions.first().getByRole('button', { name: 'Hide' })).toBeVisible()
  await expect(page.getByText(/side-by-side view arrives/i)).toHaveCount(0)
  await expect(
    page.getByText(/the harbour had been empty for a year before she noticed/i).first(),
  ).toBeVisible()

  // FR-13.6 — the hash is on screen, and its writer can hand out the public
  // record of it (item 8.12), which `proof.spec.ts` follows to the PDF. The
  // proof existed and nothing linked to it until 2026-10-16.
  await expect(versions.first()).toContainText('Fingerprint')
  const proof = versions.first().getByRole('link', { name: /proof that you wrote this/i })
  await expect(proof).toHaveAttribute('href', /^\/proof\//u)

  // FR-7.5 — any two versions, picked from the list.
  await versions.first().getByLabel('Compare', { exact: true }).check()
  await versions.last().getByLabel('Compare', { exact: true }).check()
  await expect(page.getByText(/comparing the two versions you picked/i)).toBeVisible()
})

test('a guest reads a public storyboard and is asked to sign in only to help', async ({
  browser,
}) => {
  // FR-1.2 and the sixty-second target: the account wall sits in front of
  // helping, not reading. The seeded example is public (FR-15.2).
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.goto('/s/the-yellow-wallpaper-seedyellow1')

  await expect(page.getByRole('heading', { name: 'The Yellow Wallpaper' })).toBeVisible()
  // FR-15.3 — a seeded storyboard is labelled, never passed off as a user's.
  await expect(page.getByText('Example', { exact: true })).toBeVisible()
  await expect(page.getByText(/it is very seldom that mere ordinary people/i)).toBeVisible()
  await expect(page.getByRole('link', { name: /sign in to help/i })).toBeVisible()

  // A guest gets no authoring affordances at all.
  await expect(page.getByRole('link', { name: 'Edit' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Settings' })).toHaveCount(0)

  // FR-11.5, SRS section 4 (phase 14, item 1.14) — the chapter lives in the
  // address. Switching chapters was state alone, so a reload went back to
  // chapter one and Back left the story.
  const contents = page.getByRole('navigation', { name: 'Contents' })
  await contents.getByRole('link', { name: /^2\./ }).click()
  await expect(page).toHaveURL(/\/c\/2$/)
  await expect(contents.getByRole('link', { name: /^2\./ })).toHaveAttribute('aria-current', 'page')
  await page.reload()
  await expect(page).toHaveURL(/\/c\/2$/)
  await expect(contents.getByRole('link', { name: /^2\./ })).toHaveAttribute('aria-current', 'page')
  await page.goBack()
  // The story's own address, not merely "not chapter two": the rail is read
  // only once the page behind the address has rendered.
  await expect(page).toHaveURL(/seedyellow1$/u)
  await expect(contents.getByRole('link', { name: /^1\./ })).toHaveAttribute('aria-current', 'page')

  await context.close()
})

test('a private storyboard is invisible to a stranger, not merely read-only', async ({
  browser,
}) => {
  // The phase 1 exit criterion: 404 at every route, including the API.
  const author = await browser.newContext()
  const authorPage = await author.newPage()
  await signUpAndOnboard(authorPage)

  await authorPage.goto('/new')
  await authorPage.getByLabel('Title').fill('Kept to myself')
  await authorPage.getByRole('button', { name: 'Fantasy', exact: true }).click()
  await authorPage.getByRole('radio', { name: /private/i }).check()
  await authorPage.getByRole('button', { name: /create and start writing/i }).click()
  await expect(authorPage).toHaveURL(/\/s\/kept-to-myself-/)
  const url = storyPath(authorPage)
  await author.close()

  // A signed-in stranger.
  const stranger = await browser.newContext()
  const strangerPage = await stranger.newPage()
  await signUpAndOnboard(strangerPage)

  const page = await strangerPage.goto(url)
  expect(page?.status()).toBe(404)

  // And the routes underneath it.
  for (const suffix of ['/settings', '/contents', '/c/1/1/edit', '/c/1/1/history']) {
    const response = await strangerPage.goto(`${url}${suffix}`)
    expect(response?.status(), `${url}${suffix} should be 404`).toBe(404)
  }
  await stranger.close()

  // And a guest.
  const guest = await browser.newContext()
  const guestPage = await guest.newPage()
  const guestResponse = await guestPage.goto(url)
  expect(guestResponse?.status()).toBe(404)
  await guest.close()
})
