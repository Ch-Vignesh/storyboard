import { expect, test } from '@playwright/test'

import { signUpAndOnboard } from './helpers'

/**
 * Co-authorship (SRS 3.1 and 3.2, FR-9.1, FR-12.2), in the browser: an owner
 * invites a writer by username, the writer says yes, and writes in the story
 * as its owner does. Nothing made a co-author until the 2026-10-16 spec
 * review, so every cell of the matrix's co-author column was unreachable.
 */
test('an owner invites a co-author, who accepts and writes in the story', async ({ browser }) => {
  test.setTimeout(120_000)

  const ownerContext = await browser.newContext()
  const ownerPage = await ownerContext.newPage()
  await signUpAndOnboard(ownerPage)

  const writerContext = await browser.newContext()
  const writerPage = await writerContext.newPage()
  const writer = await signUpAndOnboard(writerPage)

  // A private story: the invitation is how the writer first learns of it.
  await ownerPage.goto('/new')
  await ownerPage.getByLabel('Title').fill('Written by two')
  await ownerPage.getByRole('button', { name: 'Literary fiction', exact: true }).click()
  await ownerPage.getByRole('radio', { name: /^private/i }).check()
  await ownerPage.getByRole('button', { name: /create and start writing/i }).click()
  await expect(ownerPage).toHaveURL(/\/s\/written-by-two-/)
  const storyPath = new URL(ownerPage.url()).pathname

  // The writer cannot read it yet.
  expect((await writerPage.goto(storyPath))?.status()).toBe(404)

  // SRS 2.2 — "invite a co-author".
  await ownerPage.getByRole('link', { name: 'Co-authors' }).click()
  await ownerPage.getByLabel(/invite a co-author/i).fill(`@${writer.username}`)
  await ownerPage.getByRole('button', { name: 'Invite', exact: true }).click()
  await expect(ownerPage.getByText(/invited, and not yet answered/i)).toBeVisible()

  // The writer is told, on the dashboard and in notifications, and says yes.
  await writerPage.goto('/')
  await expect(writerPage.getByText(/asked to co-author “written by two”/i)).toBeVisible()
  await writerPage.getByRole('link', { name: 'Answer' }).click()
  await writerPage.getByRole('button', { name: /become a co-author/i }).click()
  await expect(writerPage).toHaveURL(new RegExp(`${storyPath}$`))

  // And writes in the main draft directly (SRS 3.2).
  await writerPage.getByRole('link', { name: 'Edit' }).first().click()
  const editor = writerPage.getByRole('textbox', { name: /section text/i })
  await editor.click()
  await editor.pressSequentially('Two people wrote this sentence.')
  await writerPage.getByRole('button', { name: /save now/i }).click()
  await expect(writerPage.getByText('Saved', { exact: true })).toBeVisible()

  // FR-9.1 — credited as a co-author; FR-12.2 — the owner hears of it.
  await ownerPage.goto(`${storyPath}/contributors`)
  await expect(ownerPage.getByText(writer.username).first()).toBeVisible()
  await expect(ownerPage.getByText(/co-author/i).first()).toBeVisible()
  await ownerPage.goto('/notifications')
  await expect(
    ownerPage.getByRole('link', { name: /your invitation was accepted/i }).first(),
  ).toBeVisible()

  await ownerContext.close()
  await writerContext.close()
})
