import { expect, test } from '@playwright/test'

import { signUpAndOnboard } from './helpers'

/**
 * Phase 7's exit criterion, which is a stopwatch rather than a feature:
 *
 * > A stranger can land on the marketing site, read a real stuck passage
 * > without an account, sign up, and send a suggestion in under five minutes
 * > without asking you a question.
 *
 * "Without asking you a question" is the part a test can only approximate, so
 * what this asserts instead is that nothing on the path requires knowledge a
 * first-time visitor would not have: every step is reachable by reading what is
 * on the screen, and the clock is the one the criterion names.
 *
 * The marketing site is a separate application on a separate port, so what is
 * checked here is the seeded content it points *at*, arrived at by its address.
 */

const FIVE_MINUTES = 5 * 60 * 1000

test('a stranger reads a stuck passage, signs up, and sends a suggestion', async ({ page }) => {
  test.setTimeout(FIVE_MINUTES + 60_000)
  const started = Date.now()

  // ── Read, with no account. FR-1.2: the wall is in front of helping.
  await page.goto('/s/pride-and-prejudice-seedpride01')
  await expect(page.getByRole('heading', { name: 'Pride and Prejudice' })).toBeVisible()
  await expect(page.getByText(/it is a truth universally acknowledged/i)).toBeVisible()

  // FR-15.3 — a seeded storyboard never passes as a real writer's.
  await expect(page.getByText(/^example$/i).first()).toBeVisible()

  // Decision 0007's banner explains hidden history. This storyboard has none,
  // so it must not claim to — it was public from the moment it existed.
  await expect(page.getByText(/was private until/i)).toHaveCount(0)

  // The margin of open requests is the thing that makes the site legible
  // (FR-11.5): a visitor can see somebody is stuck before they know the word.
  await expect(page.getByText(/what does mr bennet say next/i)).toBeVisible()
  await expect(page.getByRole('link', { name: /sign in to help/i })).toBeVisible()

  // ── Sign up and finish onboarding, through the real screens.
  await signUpAndOnboard(page)

  // ── Back to the passage, and send a suggestion.
  await page.goto('/s/pride-and-prejudice-seedpride01')
  await page
    .getByRole('link', { name: /read what they need/i })
    .last()
    .click()

  await expect(page.getByRole('heading', { name: /what does mr bennet say next/i })).toBeVisible()
  // FR-5.4 — the story so far is on the request, so nobody has to read the book.
  await expect(page.getByText(/mr. and mrs. bennet have been married/i)).toBeVisible()

  await page.getByRole('button', { name: /write a suggestion/i }).click()
  await expect(page).toHaveURL(/\/write$/)

  const editor = page.getByRole('textbox', { name: /your suggestion/i })
  await editor.click()
  await editor.press('Control+a')
  await editor.press('Delete')
  await editor.pressSequentially(
    '“Do you not want to know who has taken it?” cried his wife impatiently. “You want to tell me, and I have no objection to hearing it.” This was invitation enough. “Why, my dear, you must know, Mrs. Long says that Netherfield is taken by a young man of large fortune from the north of England; that he came down on Monday in a chaise and four to see the place, and was so much delighted with it that he agreed with Mr. Morris immediately; that he is to take possession before Michaelmas, and some of his servants are to be in the house by the end of next week.” “What is his name?” “Bingley.” “Is he married or single?” “Oh! single, my dear, to be sure! A single man of large fortune; four or five thousand a year. What a fine thing for our girls!” “How so? how can it affect them?” “My dear Mr. Bennet,” replied his wife, “how can you be so tiresome! You must know that I am thinking of his marrying one of them.” “Is that his design in settling here?” “Design! nonsense, how can you talk so! But it is very likely that he may fall in love with one of them, and therefore you must visit him as soon as he comes.”',
  )

  await page.getByLabel(/a note to the author/i).fill('Let her tell him what he already knows.')

  const send = page.getByRole('button', { name: /send this to the author/i })
  await expect(send).toBeEnabled()
  await send.click()
  // The suite shares one database, so an earlier run's suggestion may still be
  // on this request. What matters is that this one arrived.
  await expect(page.getByText(/waiting on the author/i).first()).toBeVisible({ timeout: 20_000 })

  // The criterion's clock. A person reads more slowly than Playwright types,
  // so this is a floor rather than a proof — but a path that takes a machine
  // four minutes could not be walked by a person in five.
  const elapsed = Date.now() - started
  expect(elapsed, `the whole path took ${String(Math.round(elapsed / 1000))}s`).toBeLessThan(
    FIVE_MINUTES,
  )
})

test('the seeded library meets its launch targets (FR-15.4)', async ({ page }) => {
  // Browse is the surface a visitor lands on if they do not arrive by link, and
  // it is the one that has to not look empty (FR-15.1).
  await page.goto('/browse')
  await expect(page.getByRole('heading', { name: /where people are stuck/i })).toBeVisible()

  // Every seeded storyboard is labelled, on every surface it appears (FR-15.3).
  // The label is lower case in the markup and upper case on the screen, so the
  // match has to be on what is written rather than on what is rendered.
  expect(await page.getByText(/^example$/i).count()).toBeGreaterThan(0)
})

test('the community rules are one click from signing up (FR-13.4)', async ({ page }) => {
  await page.goto('/signup')
  await expect(page.getByRole('link', { name: /how this place works/i })).toBeVisible()

  // Decision 0026 dropped the age gate; the half of 0020 that does the actual
  // protecting is this one, and it is still said before anybody joins.
  await expect(page.getByText(/no private messages here and there never will be/i)).toBeVisible()

  await page.getByRole('link', { name: /how this place works/i }).click()
  await expect(page).toHaveURL(/\/rules$/)
  await expect(page.getByRole('heading', { name: /how this place works/i })).toBeVisible()
  await expect(page.getByText(/nothing here is private/i)).toBeVisible()
})

test('signing up asks for an address and nothing else (decision 0026)', async ({ page }) => {
  await page.goto('/signup')

  // The age checkbox is gone. Asserted rather than merely deleted, because a
  // gate that quietly reappears is the kind of thing nobody notices.
  await expect(page.getByLabel(/13 or older/i)).toHaveCount(0)

  await page.getByLabel('Email').fill('someone@storyboard.invalid')
  await expect(page.getByRole('button', { name: /email me a link/i })).toBeEnabled()
})
