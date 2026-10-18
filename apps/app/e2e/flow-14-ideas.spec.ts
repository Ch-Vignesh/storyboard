import { expect, test } from '@playwright/test'

import { signUpAndOnboard } from './helpers'

/**
 * Ideas, through the interface (FR-5.2, FR-6.9). No flow posted one until
 * phase 14. Item 1.8: the form appears only where an idea would be taken, and
 * a closed request says why it takes none.
 */

/** FR-5.3 needs twenty words of the ask. */
const ASK =
  'I cannot decide whether Ruth should finally open the logbook here, or whether the town should find it first and bring it to her. Which is the stronger turn?'

/** FR-6.9 needs twenty words of an idea. */
const IDEA =
  'Let the town find it. Ruth has relied on nobody asking, so being handed the book by the one person who did ask breaks her reliance on silence rather than on the book.'

test('a reader answers a "help me think" request, and a closed one takes no more', async ({
  browser,
}) => {
  const authorContext = await browser.newContext()
  const authorPage = await authorContext.newPage()
  await signUpAndOnboard(authorPage)

  await authorPage.goto('/new')
  await authorPage.getByLabel('Title').fill('The logbook')
  await authorPage.getByRole('button', { name: 'Literary fiction', exact: true }).click()
  await authorPage.getByRole('button', { name: /create and start writing/i }).click()
  await expect(authorPage).toHaveURL(/\/s\/the-logbook-/)
  const storyboardUrl = new URL(authorPage.url()).pathname

  // FR-5.2 — the kind that wants ideas, not prose. No pre-context (FR-5.4).
  await authorPage.goto(`${storyboardUrl}/help/new`)
  await authorPage.getByRole('button', { name: /help me think/i }).click()
  await authorPage.getByLabel('Title').fill('Who opens the logbook?')
  await authorPage.getByLabel(/what is wrong/i).fill(ASK)
  const open = authorPage.getByRole('button', { name: /open this for help/i })
  await expect(open).toBeEnabled()
  await open.click()
  await expect(authorPage.getByRole('heading', { name: 'Who opens the logbook?' })).toBeVisible()
  const requestUrl = new URL(authorPage.url()).pathname

  // A reader posts an idea.
  const readerContext = await browser.newContext()
  const readerPage = await readerContext.newPage()
  await signUpAndOnboard(readerPage)
  await readerPage.goto(requestUrl)
  await readerPage.getByLabel('Add an idea').fill(IDEA)
  await readerPage.getByRole('button', { name: /send this idea/i }).click()
  // The list, not the box: a textarea's text content is what was typed in it,
  // so matching the words alone passed before the idea was posted.
  const posted = (page: typeof readerPage) =>
    page.getByRole('listitem').filter({ hasText: /let the town find it/i })
  await expect(posted(readerPage)).toBeVisible()
  await expect(readerPage.getByRole('heading', { name: 'Ideas (1)' })).toBeVisible()

  // Item 6.8 — the writer can change it for a while, and it says so.
  await readerPage.getByRole('button', { name: 'Change', exact: true }).click()
  const changing = readerPage.getByLabel('Your idea, changed')
  await changing.click()
  await readerPage.keyboard.press('End')
  await changing.pressSequentially(' And let a child be the one who opens it.')
  await readerPage.getByRole('button', { name: 'Save the change' }).click()
  await expect(readerPage.getByText(/· edited/u)).toBeVisible()
  await expect(readerPage.getByText(/let a child be the one/u)).toBeVisible()

  // The author reads it, replies in three words (D-7), and closes the request.
  await authorPage.goto(requestUrl)
  await expect(posted(authorPage)).toBeVisible()
  await authorPage.getByRole('button', { name: 'Reply', exact: true }).click()
  await authorPage.getByLabel('Your reply').fill('Yes, the child.')
  await authorPage.getByRole('button', { name: 'Send the reply' }).click()
  await expect(authorPage.getByText('Yes, the child.')).toBeVisible()
  await authorPage.getByRole('button', { name: /^close this/i }).click()
  // Item 5.5 — closing asks first.
  await authorPage.getByRole('dialog').getByRole('button', { name: 'Close it' }).click()
  await expect(authorPage.getByText(/this is closed/i)).toBeVisible()

  // Item 1.8 — the form is gone, and the reason is said, before anybody writes.
  await readerPage.reload()
  await expect(readerPage.getByText(/takes no more ideas/i)).toBeVisible()
  await expect(readerPage.getByLabel('Add an idea')).toHaveCount(0)
  await expect(readerPage.getByRole('button', { name: 'Reply', exact: true })).toHaveCount(0)

  // Item 6.8 — the writer removes their idea; the author's reply stays.
  await readerPage.getByRole('button', { name: 'Remove', exact: true }).first().click()
  await readerPage.getByRole('dialog').getByRole('button', { name: 'Remove it' }).click()
  await expect(readerPage.getByText('Removed by its writer.')).toBeVisible()
  await expect(readerPage.getByText('Yes, the child.')).toBeVisible()

  await readerContext.close()
  await authorContext.close()
})
