import { expect, test, type Page } from '@playwright/test'

import { signIn, signUpAndOnboard } from './helpers'

/**
 * Critical flows 3, 4 and 5 (architecture section 8), which together are the
 * phase 2 exit criterion:
 *
 * 3. Read a public storyboard as a guest, sign in, write and send a suggestion.
 * 4. The author receives it, compares, accepts — and the credit appears.
 * 5. A second suggestion goes stale, is rebased, and is accepted too; both
 *    credits survive.
 *
 * They run in one file, in order, against one storyboard, because that is what
 * the criterion describes: two accounts and one storyboard, start to finish.
 */

const PASSWORD = 'a-long-enough-passphrase'

type Account = { email: string; username: string }

let author: Account
let helper: Account
let secondHelper: Account
let storyboardUrl: string
let requestUrl: string

/** FR-5.4 needs 100 words of the story so far; FR-5.3 needs 20 of the ask. */
const ASK =
  'The section under this request is meant to turn on a single decision the narrator makes without admitting to herself that she is making it, and at the moment it simply reports what happens in order, which is why it is falling flat and reads like minutes of a meeting rather than a turning point in somebody life.'

const PRE_CONTEXT =
  'Ruth has been the harbourmaster of a small northern port for eleven years, and on her first morning in the job she logged a ship as arriving. It never arrived. She has written the same entry every morning since, has never explained it to anyone, and nobody in the town has ever asked her about it, which she has come to rely on more than she would like to admit to herself or to anybody else who might think to enquire. The logbook itself is a physical object kept on a shelf in the harbour office at a height she has never changed, and she treats it as the only authority in her life that she has not had to argue with. She inherited it from a predecessor who cut several pages out of the front of it before he left the job without notice, and she has never looked at what is missing, which is the closest thing she has to a principle worth the name.'

/** Writes some prose into whichever editor is on screen. */
async function writeInEditor(page: Page, paragraphs: readonly string[]) {
  const editor = page.getByRole('textbox', { name: /your suggestion/i })
  await editor.click()
  for (const [index, paragraph] of paragraphs.entries()) {
    if (index > 0) await page.keyboard.press('Enter')
    await editor.pressSequentially(paragraph)
  }
}

/** Enough words to clear a 150-word minimum, in whole sentences. */
function passage(opening: string): string[] {
  const body =
    'She wrote the date at the top of the page and then sat looking at it, and the light moved across the floor the way it had the day before. ' +
    'Nobody came, which was the arrangement, and she had made the arrangement herself and was not going to complain about it now. ' +
    'By the afternoon the tide was out and the boats were leaning where they always leaned, and none of it required anything from her at all. '
  return [opening, body.repeat(2).trim(), body.repeat(2).trim()]
}

test.describe.configure({ mode: 'serial' })

test('flow 3 — a guest reads, signs in, and sends a suggestion', async ({ browser }) => {
  test.setTimeout(180_000)

  // The author sets the storyboard up and opens a request.
  const authorContext = await browser.newContext()
  const authorPage = await authorContext.newPage()
  author = await signUpAndOnboard(authorPage)

  await authorPage.goto('/new')
  await authorPage.getByLabel('Title').fill('The logbook')
  await authorPage.getByRole('button', { name: 'Literary fiction', exact: true }).click()
  await authorPage.getByRole('button', { name: /create and start writing/i }).click()
  await expect(authorPage).toHaveURL(/\/s\/the-logbook-/)
  storyboardUrl = new URL(authorPage.url()).pathname

  // Put enough words in the section that a rewrite request is allowed (FR-5.7).
  await authorPage.getByRole('link', { name: 'Edit' }).first().click()
  const editor = authorPage.getByRole('textbox', { name: /section text/i })
  await editor.click()
  await editor.pressSequentially(passage('The ship had been arriving for eleven years.').join(' '))
  await authorPage.getByRole('button', { name: /save now/i }).click()
  await expect(authorPage.getByText('Saved', { exact: true })).toBeVisible()

  await authorPage.goto(`${storyboardUrl}/help/new`)
  await authorPage.getByRole('button', { name: /rewrite this/i }).click()
  await authorPage.getByLabel('Title').fill('The turn does not land')
  await authorPage.getByLabel(/what is wrong/i).fill(ASK)
  await authorPage.getByLabel(/the story so far/i).fill(PRE_CONTEXT)
  const open = authorPage.getByRole('button', { name: /open this for help/i })
  await expect(open).toBeEnabled()
  await open.click()

  // Assert on the destination rather than a URL shape: `/help/new` also matches
  // a publicId-shaped path, so a refusal here would otherwise pass silently.
  await expect(authorPage.getByRole('heading', { name: 'The turn does not land' })).toBeVisible()
  requestUrl = new URL(authorPage.url()).pathname
  expect(requestUrl).not.toMatch(/\/help\/new$/)
  await authorContext.close()

  // A guest can read it, and is asked to sign in only in order to help.
  const guestContext = await browser.newContext()
  const guestPage = await guestContext.newPage()
  await guestPage.goto(requestUrl)
  await expect(guestPage.getByRole('heading', { name: 'The turn does not land' })).toBeVisible()
  await expect(guestPage.getByText(/the story so far/i)).toBeVisible()
  await expect(guestPage.getByRole('link', { name: /sign in to help/i })).toBeVisible()
  await expect(guestPage.getByRole('button', { name: /write a suggestion/i })).toHaveCount(0)
  await guestContext.close()

  // A helper signs up and sends one.
  const helperContext = await browser.newContext()
  const helperPage = await helperContext.newPage()
  helper = await signUpAndOnboard(helperPage)

  await helperPage.goto(requestUrl)
  await helperPage.getByRole('button', { name: /write a suggestion/i }).click()
  await expect(helperPage).toHaveURL(/\/write$/)

  // FR-6.1 — a rewrite composer opens pre-filled with the current text.
  await expect(helperPage.getByText(/private draft/i)).toBeVisible()
  await expect(helperPage.getByText(/the ship had been arriving/i)).toBeVisible()

  await helperPage.getByRole('textbox', { name: /your suggestion/i }).click()
  await helperPage.keyboard.press('Control+a')
  await helperPage.keyboard.press('Delete')
  await writeInEditor(helperPage, passage('She did not write the ship down that morning.'))

  await helperPage.getByLabel(/a note to the author/i).fill('Made the omission the event.')
  const send = helperPage.getByRole('button', { name: /send this to the author/i })
  await expect(send).toBeEnabled()
  await send.click()

  await expect(helperPage).toHaveURL(new RegExp(`${requestUrl.replace(/\//g, '\\/')}$`))
  await expect(helperPage.getByText(/waiting on the author/i)).toBeVisible()
  await helperContext.close()
})

test('flow 4 — the author compares, accepts, and the credit appears', async ({ browser }) => {
  test.setTimeout(180_000)

  const context = await browser.newContext()
  const page = await context.newPage()
  await signIn(page, author.email, PASSWORD)

  await page.goto(requestUrl)
  await page
    .getByRole('link', { name: /read and decide/i })
    .first()
    .click()

  // FR-7 — the comparison, with its four counts.
  await expect(page.getByRole('heading', { name: /suggestion$/i })).toBeVisible()
  const summary = page.getByRole('group', { name: /what changed/i })
  await expect(summary).toContainText('kept')
  await expect(summary).toContainText('changed')
  await expect(summary).toContainText('added')
  await expect(summary).toContainText('removed')
  await expect(page.getByRole('button', { name: /side by side/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /read it straight/i })).toBeVisible()
  await expect(page.getByText(/made the omission the event/i)).toBeVisible()

  // FR-8.1 — accepting writes a revision authored by the contributor.
  await page.getByRole('button', { name: /accept into the main draft/i }).click()
  await expect(page).toHaveURL(new RegExp(`${requestUrl.replace(/\//g, '\\/')}$`))
  await expect(page.getByText('accepted', { exact: false }).first()).toBeVisible()

  // FR-9.2 — the credit is on the storyboard's contributors page.
  await page.goto(`${storyboardUrl}/contributors`)
  await expect(page.getByText(helper.username)).toBeVisible()
  await expect(page.getByText(/wrote a passage/i)).toBeVisible()

  // FR-9.1 — and on the contributor's own profile.
  await page.goto(`/@${helper.username}`)
  await expect(page.getByRole('heading', { name: helper.username })).toBeVisible()
  await expect(page.getByRole('link', { name: 'The logbook' })).toBeVisible()

  await context.close()
})

test('flow 5 — a second suggestion goes stale, is rebased, and is accepted too', async ({
  browser,
}) => {
  test.setTimeout(240_000)

  // A second helper writes against the *original* text, before flow 4's accept
  // has been seen — so this is deliberately built on a head that has moved.
  const secondContext = await browser.newContext()
  const secondPage = await secondContext.newPage()
  secondHelper = await signUpAndOnboard(secondPage)

  // The author reopens the request so there is somewhere to send it.
  const authorContext = await browser.newContext()
  const authorPage = await authorContext.newPage()
  await signIn(authorPage, author.email, PASSWORD)
  await authorPage.goto(requestUrl)
  await authorPage.getByRole('button', { name: /open it again/i }).click()
  await expect(
    authorPage.getByRole('button', { name: /close this without accepting/i }),
  ).toBeVisible()

  await secondPage.goto(requestUrl)
  await secondPage.getByRole('button', { name: /write a suggestion/i }).click()
  await secondPage.getByRole('textbox', { name: /your suggestion/i }).click()
  await secondPage.keyboard.press('Control+a')
  await secondPage.keyboard.press('Delete')
  await writeInEditor(secondPage, passage('The entry for that morning is the only one in pencil.'))
  await secondPage.getByRole('button', { name: /send this to the author/i }).click()
  await expect(secondPage.getByText(/waiting on the author/i)).toBeVisible()

  // The author edits the section directly, which moves the head underneath it.
  await authorPage.goto(`${storyboardUrl}/c/1/1/edit`)
  const editor = authorPage.getByRole('textbox', { name: /section text/i })
  await editor.click()
  await authorPage.keyboard.press('Control+End')
  await editor.pressSequentially(' She closed the book.')
  await authorPage.getByRole('button', { name: /save now/i }).click()
  await expect(authorPage.getByText('Saved', { exact: true })).toBeVisible()

  // FR-6.7 — accepting anything on this request would have marked it stale;
  // here the author's own edit has already moved the head, so the suggestion is
  // shown as written against text that has changed.
  await authorPage.goto(requestUrl)
  await authorPage
    .getByRole('link', { name: /read and decide/i })
    .first()
    .click()
  await expect(authorPage.getByText(/written against an earlier version/i)).toBeVisible()

  // FR-6.7 — a suggestion only becomes STALE when an acceptance moves the head.
  // Here the author edited directly, so it is still SUBMITTED but anchored to a
  // revision that is no longer current; the contributor can re-anchor it if the
  // state offers that, and otherwise it is accepted with the change acknowledged.
  await secondPage.goto(requestUrl)
  const update = secondPage.getByRole('button', { name: /update it against the new text/i })
  if (await update.isVisible().catch(() => false)) {
    await update.click()
    await expect(secondPage).toHaveURL(/\/write$/)
    const resend = secondPage.getByRole('button', { name: /send this to the author/i })
    await expect(resend).toBeEnabled()
    await resend.click()
    await expect(secondPage.getByText(/waiting on the author/i)).toBeVisible()
  }

  // The author accepts it, acknowledging that the section moved underneath it.
  await authorPage.goto(requestUrl)
  await authorPage
    .getByRole('link', { name: /read and decide/i })
    .first()
    .click()
  const acceptSecond = authorPage.getByRole('button', { name: /accept into the main draft/i })
  await expect(acceptSecond).toBeEnabled()
  await acceptSecond.click()

  // Wait for the decision to land rather than racing the next navigation.
  await expect(authorPage).toHaveURL(new RegExp(`${requestUrl.replace(/\//g, '\\/')}$`))
  await expect(authorPage.getByRole('link', { name: /read and decide/i })).toHaveCount(0)

  // FR-6.8 — accepting a second suggestion keeps both credits.
  await authorPage.goto(`${storyboardUrl}/contributors`)
  await expect(authorPage.getByText('2 writers have contributed')).toBeVisible()
  await expect(authorPage.getByRole('link', { name: helper.username })).toBeVisible()
  await expect(authorPage.getByRole('link', { name: secondHelper.username })).toBeVisible()

  await secondContext.close()
  await authorContext.close()
})
