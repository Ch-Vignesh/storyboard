import { readFileSync } from 'node:fs'

import { expect, type Page } from '@playwright/test'

/**
 * Shared steps for the critical flows. Everything here goes through the real
 * interface; nothing reaches into the database to shortcut a state, because a
 * flow test that skips the flow proves nothing.
 */

const PASSWORD = 'A-long-enough-passphrase-1!'

let counter = 0

/** A fresh address per test. `.invalid` is reserved and can never be delivered to. */
export function newEmail(): string {
  counter += 1
  return `flow-${String(Date.now())}-${String(counter)}@storyboard.invalid`
}

export function uniqueUsername(): string {
  counter += 1
  // Lowercase letters, digits and hyphens only (FR-1.3).
  return `flow-${String(Date.now()).slice(-8)}-${String(counter)}`
}

/**
 * A link to `route`, read from the newest message the console mailer appended
 * to `MAIL_LOG_FILE` for this recipient that carries one. Polls because the
 * mail is written while the request that sends it is still in flight.
 */
export async function readEmailedLink(email: string, route: string): Promise<string> {
  const path = process.env.MAIL_LOG_FILE
  if (!path) throw new Error('MAIL_LOG_FILE is not set; the flow cannot read its email.')
  // The token, and the destination a sign-up link carries after it (item 3.5):
  // percent-encoded, so nothing past it can be mistaken for part of it.
  const link = new RegExp(
    `https?://\\S*${route}\\?token=[A-Za-z0-9_-]+(?:&next=[A-Za-z0-9%._~-]+)?`,
    'u',
  )

  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    let contents = ''
    try {
      contents = readFileSync(path, 'utf8')
    } catch {
      // Not written yet.
    }
    // Messages are appended, so the newest one to this recipient comes last.
    const blocks = contents.split('MAIL (not sent').filter((block) => block.includes(email))
    const match = blocks
      .reverse()
      .find((block) => link.test(block))
      ?.match(link)
    if (match) return match[0]
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`No ${route} link for ${email} appeared in ${path}`)
}

/** FR-1.3 — the sign-up verification link. */
export function readVerificationLink(email: string): Promise<string> {
  return readEmailedLink(email, '/verify')
}

/** Sign up, verify, and complete both onboarding steps. Leaves you signed in. */
export async function signUpAndOnboard(page: Page): Promise<{ email: string; username: string }> {
  const email = newEmail()
  const username = uniqueUsername()

  await page.goto('/signup')
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: /email me a link/i }).click()

  await page.goto(await readVerificationLink(email))
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByLabel('Type it again').fill(PASSWORD)
  await page.getByRole('button', { name: /set password/i }).click()

  await expect(page).toHaveURL(/\/onboarding\/username/)
  await page.getByLabel('Username').fill(username)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: /take this name/i }).click()

  await expect(page).toHaveURL(/\/onboarding\/genres/)
  for (const genre of ['Literary fiction', 'Fantasy', 'Horror']) {
    await page.getByRole('button', { name: genre, exact: true }).click()
  }
  // FR-13.4 (item 2.3) — the rules are read, and ticked, before Finish.
  await page.getByRole('checkbox', { name: /community rules/i }).check()
  await page.getByRole('button', { name: /finish/i }).click()
  await expect(page.getByRole('heading', { name: /your dashboard/i })).toBeVisible()

  return { email, username }
}

/** Signs an existing account in through the real form. */
export async function signIn(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.goto('/signin')
  // Item 3.11 — a browser still signed in is sent away from /signin. Leave
  // first, from the header, and come back to the form.
  if (!page.url().includes('/signin')) {
    await page.getByRole('button', { name: 'Sign out' }).first().click()
    await expect(page).toHaveURL(/\/signin/u)
  }
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page).not.toHaveURL(/\/signin/)
}

const HELPER_ASK =
  'The section under this request is meant to turn on a single decision the narrator makes without admitting to herself that she is making it, and at the moment it simply reports what happens in order, which is why it reads like minutes of a meeting rather than a turning point.'

const HELPER_CONTEXT =
  'Ruth has been the harbourmaster of a small northern port for eleven years, and on her first morning in the job she logged a ship as arriving. It never arrived. She has written the same entry every morning since, has never explained it to anyone, and nobody in the town has ever asked her about it, which she has come to rely on more than she would like to admit to herself or to anybody else who might think to enquire. The logbook is kept on a shelf at a height she has never changed, and she treats it as the only authority in her life she has not had to argue with.'

/**
 * A public story with one written section and one open request for what
 * comes next, made by whoever `page` is signed in as. Returns the story's
 * path and the request page's path.
 */
export async function openRequest(
  page: Page,
  title: string,
): Promise<{ path: string; requestPath: string }> {
  await page.goto('/new')
  await page.getByLabel('Title').fill(title)
  await page.getByRole('button', { name: 'Literary fiction', exact: true }).click()
  await page.getByRole('button', { name: /create and start writing/i }).click()
  await expect(page).toHaveURL(/\/s\//)
  const path = new URL(page.url()).pathname

  await page.getByRole('link', { name: 'Edit' }).first().click()
  const editor = page.getByRole('textbox', { name: /section text/i })
  await editor.click()
  await editor.pressSequentially(
    'She counted the lamp turns until they stopped agreeing with the clock, and wrote both numbers down.',
  )
  await page.getByRole('button', { name: /save now/i }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()

  await page.goto(`${path}/help/new`)
  await page.getByRole('button', { name: /write what comes next/i }).click()
  await page.getByLabel('Title').fill('What happens the next morning?')
  await page.getByLabel(/what is wrong/i).fill(HELPER_ASK)
  await page.getByLabel(/the story so far/i).fill(HELPER_CONTEXT)
  await page.getByRole('button', { name: /open this for help/i }).click()
  await expect(page.getByRole('heading', { name: 'What happens the next morning?' })).toBeVisible()

  return { path, requestPath: new URL(page.url()).pathname }
}

/** Writes some prose into whichever editor is on screen. */
export async function writeInEditor(page: Page, paragraphs: readonly string[]): Promise<void> {
  const editor = page.getByRole('textbox', { name: /your suggestion/i })
  await editor.click()
  for (const [index, paragraph] of paragraphs.entries()) {
    if (index > 0) await page.keyboard.press('Enter')
    await editor.pressSequentially(paragraph)
  }
}

/** Enough words to clear a 150-word minimum, in whole sentences. */
export function passage(opening: string): string[] {
  const body =
    'She wrote the date at the top of the page and then sat looking at it, and the light moved across the floor the way it had the day before. ' +
    'Nobody came, which was the arrangement, and she had made the arrangement herself and was not going to complain about it now. ' +
    'By the afternoon the tide was out and the boats were leaning where they always leaned, and none of it required anything from her at all. '
  return [opening, body.repeat(2).trim(), body.repeat(2).trim()]
}

/**
 * Whoever `page` is signed in as writes a suggestion on the request at
 * `requestPath` and sends it. Ends back on the request, waiting on the author.
 */
export async function sendSuggestion(page: Page, requestPath: string): Promise<void> {
  await page.goto(requestPath)
  await page.getByRole('button', { name: /write a suggestion/i }).click()
  await expect(page).toHaveURL(/\/write$/u)
  await page.getByRole('textbox', { name: /your suggestion/i }).click()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Delete')
  await writeInEditor(page, passage('She did not write the ship down that morning.'))
  await page.getByLabel(/a note to the author/i).fill('Made the omission the event.')
  const send = page.getByRole('button', { name: /send this to the author/i })
  await expect(send).toBeEnabled()
  await send.click()
  await expect(page).toHaveURL(new RegExp(`${requestPath.replaceAll('/', '\\/')}$`, 'u'))
  await expect(page.getByText(/waiting on the author/i)).toBeVisible()
}
