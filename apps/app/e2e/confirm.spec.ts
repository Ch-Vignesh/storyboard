import { expect, test } from '@playwright/test'

import { openRequest, sendSuggestion, signUpAndOnboard } from './helpers'

/**
 * Phase 14, milestone 5 — nothing is lost without asking first. One dialog
 * (`components/confirm-dialog.tsx`) in front of closing a request, going
 * private, passing, withdrawing, restoring, joining and removing, each
 * saying what follows in the server's numbers.
 */
test('closing, going private, passing, withdrawing, restoring, joining and removing all ask first', async ({
  page,
  browser,
}) => {
  test.slow()
  const dialog = () => page.getByRole('dialog')

  await signUpAndOnboard(page)
  const { path, requestPath } = await openRequest(page, 'Asked first')

  // A helper sends a suggestion.
  const helperContext = await browser.newContext()
  const helperPage = await helperContext.newPage()
  const helper = await signUpAndOnboard(helperPage)
  await sendSuggestion(helperPage, requestPath)

  // 5.5 — closing asks, names who is told, and "Keep it" leaves it open.
  await page.goto(requestPath)
  await page.getByRole('button', { name: /close this without accepting/i }).click()
  await expect(dialog()).toContainText(
    `1 person with a draft or a waiting suggestion will be told: ${helper.username}.`,
  )
  await dialog().getByRole('button', { name: 'Keep it as it is' }).click()
  await expect(dialog()).toBeHidden()
  await expect(page.getByRole('button', { name: /close this without accepting/i })).toBeVisible()

  // 5.4 — going private asks, and says what closes.
  await page.goto(`${path}/settings`)
  await page.getByRole('button', { name: 'Make it private' }).click()
  await expect(dialog()).toContainText(
    `1 open request closes, and ${helper.username} will be told.`,
  )
  await dialog().getByRole('button', { name: 'Keep it as it is' }).click()
  await expect(dialog()).toBeHidden()
  await expect(page.getByText('This story is public.')).toBeVisible()

  // 5.6 — passing asks, with the chips, and the button names what it does.
  await page.goto(requestPath)
  await page
    .getByRole('link', { name: /read and decide/i })
    .first()
    .click()
  await page.getByRole('button', { name: 'Go a different way' }).click()
  await dialog().getByRole('button', { name: 'Not the direction I want' }).click()
  await dialog().getByRole('button', { name: 'Pass on it' }).click()
  await expect(page).toHaveURL(new RegExp(`${requestPath.replaceAll('/', '\\/')}$`, 'u'))
  await expect(page.getByText('not used', { exact: true })).toBeVisible()

  // 5.6 — withdrawing asks, and a new draft can start from the words.
  await sendSuggestion(helperPage, requestPath)
  await helperPage.getByRole('button', { name: 'Withdraw' }).click()
  await helperPage.getByRole('dialog').getByRole('button', { name: 'Withdraw it' }).click()
  await helperPage.getByRole('button', { name: 'Start a new draft from it' }).click()
  await expect(helperPage).toHaveURL(/\/write$/u)
  await expect(helperPage.getByRole('textbox', { name: /your suggestion/i })).toContainText(
    /she did not write the ship down/i,
  )
  await helperContext.close()

  // 5.3 — restoring asks. A second revision first, so there is one to go back to.
  await page.goto(`${path}/c/1/1/edit`)
  const editor = page.getByRole('textbox', { name: /section text/i })
  await editor.click()
  await page.keyboard.press('End')
  await editor.pressSequentially(' And the lamp went out.')
  await page.getByRole('button', { name: /save now/i }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  await page.goto(`${path}/c/1/1/history`)
  await page.getByRole('button', { name: 'Restore this version' }).first().click()
  await expect(dialog()).toContainText('Nobody else’s accepted words are affected.')
  await dialog().getByRole('button', { name: 'Restore this version' }).click()
  await expect(page.getByText(/restored from/i).first()).toBeVisible()

  // 5.5 — closing for real, and opening it again.
  await page.goto(requestPath)
  await page.getByRole('button', { name: /close this without accepting/i }).click()
  await dialog().getByRole('button', { name: 'Close it' }).click()
  await expect(page.getByRole('button', { name: 'Open it again' })).toBeVisible()
  await page.getByRole('button', { name: 'Open it again' }).click()
  await expect(page.getByRole('button', { name: /close this without accepting/i })).toBeVisible()

  // 5.2 — joining and removing sections ask, and say what follows.
  await page.goto(`${path}/contents`)
  await page.getByRole('button', { name: 'Add a section' }).click()
  await expect(page.getByRole('button', { name: 'Join with the one above' })).toHaveCount(1)
  await page.getByRole('button', { name: 'Join with the one above' }).click()
  await expect(dialog()).toContainText('move into the section above')
  await dialog().getByRole('button', { name: 'Join them' }).click()
  await expect(page.getByRole('button', { name: 'Join with the one above' })).toHaveCount(0)

  // 5.8 — the joined-away section keeps an address for its earlier versions,
  // from the history of the section that took its words.
  await page.goto(`${path}/c/1/1/history`)
  await page.getByRole('link', { name: /its earlier versions/i }).click()
  await expect(page).toHaveURL(/\/sections\/[^/]+\/history$/u)
  await expect(page.getByRole('heading', { name: /^History of/ })).toBeVisible()
  await expect(page.getByText(/joined into/i)).toBeVisible()
  await page.goto(`${path}/contents`)

  await page.getByRole('button', { name: 'Add a section' }).click()
  await expect(page.getByRole('button', { name: 'Join with the one above' })).toHaveCount(1)
  await page.getByRole('button', { name: 'Remove' }).last().click()
  await expect(dialog()).toContainText('No open requests are affected.')
  await dialog().getByRole('button', { name: 'Remove the section' }).click()
  await expect(page.getByRole('button', { name: 'Join with the one above' })).toHaveCount(0)

  // 5.2 — removing a chapter names the request that closes and who is told.
  await page.getByLabel('New chapter name').fill('Two')
  await page.getByRole('button', { name: 'Add a chapter' }).click()
  await expect(page.getByRole('button', { name: 'Remove' }).first()).toBeEnabled()
  await page.getByRole('button', { name: 'Remove' }).first().click()
  await expect(dialog()).toContainText('Its 1 section and')
  await expect(dialog()).toContainText(
    `1 open request closes, and ${helper.username} will be told.`,
  )
  await dialog().getByRole('button', { name: 'Remove the chapter and 1 section' }).click()
  await expect(dialog()).toBeHidden()
  await page.goto(requestPath)
  await expect(page.getByRole('button', { name: /close this without accepting/i })).toHaveCount(0)
  // And not opened again on a section that is gone (found by this flow).
  await expect(page.getByRole('button', { name: 'Open it again' })).toBeVisible()
  await page.getByRole('button', { name: 'Open it again' }).click()
  await expect(page.getByText(/no longer in the story/i)).toBeVisible()

  // 5.7 — the way back: the chapter returns with its section, at the end;
  // the request stays closed.
  await page.goto(`${path}/contents`)
  await expect(page.getByRole('heading', { name: /removed in the last/i })).toBeVisible()
  // One row: the chapter. The section removed earlier sat in it, so it is
  // not offered on its own while its chapter is gone; it reappears once the
  // chapter is back, still removed, with its own way back.
  await expect(page.getByRole('button', { name: 'Bring it back' })).toHaveCount(1)
  await page.getByRole('button', { name: 'Bring it back' }).click()
  await expect(page.getByLabel(/^Chapter 2, section 1 name$/)).toBeVisible()
  await expect(page.getByText(/^Section of /)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Bring it back' })).toHaveCount(1)
  await page.goto(requestPath)
  await expect(page.getByRole('button', { name: /close this without accepting/i })).toHaveCount(0)
})
