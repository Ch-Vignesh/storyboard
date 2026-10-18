import { expect, test } from '@playwright/test'

import { openRequest, sendSuggestion, signUpAndOnboard } from './helpers'

/**
 * Phase 14, items 6.5 and 6.6 — a draft knows when the text it was started
 * against has moved on, and can move with it; a draft that was never sent can
 * be found again under "Not sent yet", continued, and thrown away after
 * asking.
 */
test('a draft follows the text it was started against, is findable, and can be thrown away', async ({
  page,
  browser,
}) => {
  test.slow()
  const authorContext = await browser.newContext()
  const authorPage = await authorContext.newPage()
  await signUpAndOnboard(authorPage)
  const { path, requestPath } = await openRequest(authorPage, 'A draft to find again')

  await signUpAndOnboard(page)
  await page.goto(requestPath)
  await page.getByRole('button', { name: /write a suggestion/i }).click()
  await expect(page).toHaveURL(/\/write$/u)
  await expect(page.getByText('The section has changed since you started.')).toHaveCount(0)

  // The author changes the section while the draft is open.
  await authorPage.goto(`${path}/c/1/1/edit`)
  const editor = authorPage.getByRole('textbox', { name: /section text/i })
  await editor.click()
  await authorPage.keyboard.press('End')
  await editor.pressSequentially(' And then the tide turned.')
  await authorPage.getByRole('button', { name: /save now/i }).click()
  await expect(authorPage.getByText('Saved', { exact: true })).toBeVisible()
  await authorContext.close()

  // 6.6 — back in the composer, the draft knows, shows what moved, and moves.
  await page.reload()
  await expect(page.getByText('The section has changed since you started.')).toBeVisible()
  await page.getByRole('button', { name: 'What changed' }).click()
  await expect(page.getByText(/the tide turned/u).first()).toBeVisible()
  await page.getByRole('button', { name: 'Update my draft to the new text' }).click()
  await expect(page.getByText('The section has changed since you started.')).toHaveCount(0)

  // 6.5 — found again, continued, and thrown away after asking.
  await page.goto('/suggestions')
  await expect(page.getByRole('heading', { name: 'Not sent yet' })).toBeVisible()
  await expect(page.getByText('What happens the next morning?')).toBeVisible()
  await page.getByRole('link', { name: 'Continue' }).click()
  await expect(page).toHaveURL(/\/write$/u)

  await page.goto('/suggestions')
  await page.getByRole('button', { name: 'Throw away' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Throw it away' }).click()
  await expect(page.getByRole('heading', { name: 'Not sent yet' })).toHaveCount(0)
  await expect(page.getByText(/nothing sent yet/i)).toBeVisible()
})

/**
 * Phase 14, item 6.7 (D-12) — a sent suggestion can be changed by its writer
 * until an author opens it, and says it was edited; once opened, it cannot.
 */
test('a sent suggestion can be changed until the author opens it', async ({ page, browser }) => {
  test.slow()
  const authorContext = await browser.newContext()
  const authorPage = await authorContext.newPage()
  await signUpAndOnboard(authorPage)
  const { requestPath } = await openRequest(authorPage, 'A suggestion that changes')

  await signUpAndOnboard(page)
  await sendSuggestion(page, requestPath)
  await page.getByRole('link', { name: 'Change it' }).click()
  await expect(page).toHaveURL(/\/write\?change=/u)
  const editor = page.getByRole('textbox', { name: /your suggestion/i })
  await editor.click()
  await page.keyboard.press('End')
  await editor.pressSequentially(' She counted every day of it.')
  await page.getByRole('button', { name: 'Save the change' }).click()
  await expect(page).toHaveURL(new RegExp(`${requestPath.replaceAll('/', '\\/')}$`, 'u'))
  await expect(page.getByText(/· edited/u)).toBeVisible()

  // The author opens it: from then on it cannot change.
  await authorPage.goto(requestPath)
  await authorPage
    .getByRole('link', { name: /read and decide/i })
    .first()
    .click()
  await expect(authorPage.getByText(/counted every day of it/u).first()).toBeVisible()
  await authorContext.close()

  await page.reload()
  await expect(page.getByRole('link', { name: 'Change it' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Withdraw' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('dialog').getByText(/change it instead/i)).toHaveCount(0)
  await page.getByRole('dialog').getByRole('button', { name: 'Keep it as it is' }).click()
})
