import { expect, test } from '@playwright/test'

import { signUpAndOnboard, storyPath } from './helpers'

/**
 * FR-4.2 in the editor (decision 0040): a script is written element by
 * element. Until the 2026-10-16 spec review the elements arrived only by
 * import, and a new screenplay was written as one run of action.
 */
test('a screenwriter writes a scene, element by element', async ({ page }) => {
  await signUpAndOnboard(page)

  await page.goto('/new')
  await page.getByLabel('Title').fill('Harbour lights')
  await page.getByLabel('What is it?').selectOption('SCREENPLAY')
  await page.getByRole('button', { name: 'Thriller', exact: true }).click()
  await page.getByRole('button', { name: /create and start writing/i }).click()
  await expect(page).toHaveURL(/\/s\/harbour-lights-/)
  const story = storyPath(page)

  const editor = page.getByRole('textbox', { name: /section text/i })
  const element = page.getByRole('combobox', { name: 'Element' })
  await editor.click()

  // Chosen from the menu, then carried on by the keys.
  await element.selectOption('scene_heading')
  await editor.pressSequentially('INT. HARBOUR OFFICE - NIGHT')
  await page.keyboard.press('Enter')
  await expect(element).toHaveValue('action')
  await editor.pressSequentially('Rain against the glass.')
  await page.keyboard.press('Enter')
  // Tab moves through the elements: action, scene heading, character.
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(element).toHaveValue('character')
  await editor.pressSequentially('MARGARET')
  await page.keyboard.press('Enter')
  await expect(element).toHaveValue('dialogue')
  await editor.pressSequentially('You came.')

  await page.getByRole('button', { name: /save now/i }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()

  // Read back as a script.
  await page.goto(story)
  await expect(page.locator('.sp-scene_heading')).toHaveText('INT. HARBOUR OFFICE - NIGHT')
  await expect(page.locator('.sp-action')).toHaveText('Rain against the glass.')
  await expect(page.locator('.sp-character')).toHaveText('MARGARET')
  await expect(page.locator('.sp-dialogue')).toHaveText('You came.')
})
