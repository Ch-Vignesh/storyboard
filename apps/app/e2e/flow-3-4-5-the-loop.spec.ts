import { expect, test } from '@playwright/test'

import { passage, signIn, signUpAndOnboard, writeInEditor, storyPath } from './helpers'

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

const PASSWORD = 'A-long-enough-passphrase-1!'

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
  storyboardUrl = storyPath(authorPage)

  // Put enough words in the section that a rewrite request is allowed (FR-5.7).
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
  await expect(helperPage.getByRole('textbox', { name: /your suggestion/i })).toContainText(
    /the ship had been arriving/i,
  )
  // And the story so far, and the section as it stands, stay in view while
  // it is rewritten (the composer showed neither until 2026-10-16).
  await expect(helperPage.getByText('The story so far')).toBeVisible()
  await expect(helperPage.getByText('The section as it stands')).toBeVisible()

  await helperPage.getByRole('textbox', { name: /your suggestion/i }).click()
  await helperPage.keyboard.press('Control+a')
  await helperPage.keyboard.press('Delete')
  // One paragraph more than the original, so the comparison has a wholly
  // added paragraph to label (FR-7.1, NFR-4; phase 14 item 1.19).
  await writeInEditor(helperPage, [
    ...passage('She did not write the ship down that morning.'),
    'That was the whole of it, and she knew it.',
  ])

  // A note typed and left at once is kept: a three-second timer was its only
  // save, and the link did not wait for it (2026-10-26 final pass).
  const composer = helperPage.url()
  await helperPage.getByLabel(/a note to the author/i).fill('Made the omission the event.')
  await helperPage.getByRole('link', { name: /leave it as a draft/i }).click()
  await expect(helperPage).not.toHaveURL(composer)
  await helperPage.goto(composer)
  await expect(helperPage.getByLabel(/a note to the author/i)).toHaveValue(
    'Made the omission the event.',
  )
  const send = helperPage.getByRole('button', { name: /send this to the author/i })
  await expect(send).toBeEnabled()
  await send.click()

  await expect(helperPage).toHaveURL(new RegExp(`${requestUrl.replace(/\//g, '\\/')}$`))
  await expect(helperPage.getByText(/waiting on the author/i)).toBeVisible()

  // And it can be found again from the dashboard, while it waits. Nothing
  // listed a helper's own suggestions until the 2026-10-16 spec review.
  await helperPage.goto('/')
  // Item 4.1 put the link in the header too; the dashboard's own is the one
  // this flow has always followed.
  await helperPage.locator('#main').getByRole('link', { name: 'Your suggestions' }).click()
  await expect(helperPage.getByRole('heading', { name: 'Your suggestions' })).toBeVisible()
  await expect(helperPage.getByText(/waiting on the author/i)).toBeVisible()

  // Item 6.10 — your own profile says where it is changed.
  await helperPage.goto(`/@${helper.username}`)
  await expect(helperPage.getByRole('link', { name: /edit your profile/i })).toHaveAttribute(
    'href',
    '/settings',
  )
  await helperContext.close()
})

test('flow 4 — the author compares, accepts, and the credit appears', async ({ browser }) => {
  test.setTimeout(180_000)

  const context = await browser.newContext()
  const page = await context.newPage()
  await signIn(page, author.email, PASSWORD)

  // Item 6.14 — the dashboard leads with what needs the author: the
  // suggestion that is waiting, with Compare.
  await page.goto('/')
  const needsYou = page.getByRole('region', { name: 'Needs you' })
  await expect(needsYou).toContainText(/sent a suggestion for/u)
  await needsYou.getByRole('link', { name: 'Compare' }).first().click()
  await expect(page).toHaveURL(/\/help\/[^/]+\/s\/[^/]+$/u)

  // FR-12.1 — the author hears of it, and the notification leads to it. Until
  // the 2026-10-16 spec review it named nothing and led nowhere.
  await page.goto('/notifications')
  await page
    .getByRole('link', { name: /a suggestion arrived/i })
    .first()
    .click()
  await expect(page).toHaveURL(/\/help\/[^/]+\/s\/[^/]+$/)
  // Item 6.9 — opening the row marked it read, and it says who sent what where.
  await page.goto('/notifications')
  const opened = page.getByRole('link', { name: /a suggestion arrived/i }).first()
  await expect(opened).not.toContainText('(unread)')
  await expect(opened).toContainText(
    /sent a suggestion for the passage you opened for help in chapter/i,
  )

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
  // FR-7.1, NFR-4 (item 1.19) — a wholly added paragraph is labelled in words,
  // not by a tint alone; the placeholder opposite it was hidden from screen
  // readers and nothing else said so. This comparison is a rewrite, so it
  // opens in read-through (FR-7.2.3); the rows are behind the toggle.
  await page.getByRole('button', { name: /side by side/i }).click()
  await expect(page.getByText('Added', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /read it straight/i })).toBeVisible()
  await expect(page.getByText(/made the omission the event/i)).toBeVisible()

  // FR-8.1 — accepting writes a revision authored by the contributor.
  await page.getByRole('button', { name: /accept into the main draft/i }).click()
  await expect(page).toHaveURL(new RegExp(`${requestUrl.replace(/\//g, '\\/')}$`))
  await expect(page.getByText('accepted', { exact: false }).first()).toBeVisible()

  // FR-9.2 — the credit is on the storyboard's contributors page.
  await page.goto(`${storyboardUrl}/contributors`)
  // `.first()` because FR-9.6's front-matter block below repeats every name and
  // role as plain text, so each now appears twice on this page by design.
  await expect(page.getByText(helper.username).first()).toBeVisible()
  await expect(page.getByText(/wrote a passage/i).first()).toBeVisible()
  // Item 6.17 — and how much of the draft is the author's own, now that it is not all.
  await expect(page.getByText(/\d+% of the main draft is the author’s own words/u)).toBeVisible()
  // Item 6.10 — and where, counted as the reader counts, linked.
  await expect(page.getByRole('link', { name: /chapter 1, section 1/i }).first()).toHaveAttribute(
    'href',
    /\/c\/1\/1$/,
  )

  /*
   * FR-9.6 — and the same credit as plain text, for a manuscript's front
   * matter: name, role, chapter, date and the permanent address.
   *
   * The address is the part worth asserting. A credit records a *lineage*, not
   * a section id, so turning one into a URL means resolving where that lineage
   * currently sits in the main draft — and a line in a printed book that points
   * at the wrong chapter is worse than one that points nowhere.
   */
  const frontMatter = page.locator('pre')
  await expect(frontMatter).toContainText(helper.username)
  await expect(frontMatter).toContainText('wrote a passage')
  await expect(frontMatter).toContainText(`/s/${storyboardUrl.split('/s/')[1] ?? ''}/c/1/1`)
  await expect(page.getByRole('button', { name: /^copy$/i })).toBeVisible()

  // And the address leads to the passage. Until the 2026-10-16 spec review
  // every one printed was a 404.
  await page.goto(`${storyboardUrl}/c/1/1`)
  await expect(page.getByText(/she did not write the ship down that morning/i)).toBeVisible()
  await page.goto(`${storyboardUrl}/c/1`)
  await expect(page.getByText(/she did not write the ship down that morning/i)).toBeVisible()

  // FR-9.1 — and on the contributor's own profile.
  await page.goto(`/@${helper.username}`)
  await expect(page.getByRole('heading', { name: helper.username, exact: true })).toBeVisible()
  // Item 6.13 — the calendar counts the help: one day, the suggestion sent in flow 3.
  await expect(
    page.getByRole('heading', { name: `Days ${helper.username} wrote something for someone` }),
  ).toBeVisible()
  await expect(page.getByText('Helped on 1 day in the last year.', { exact: true })).toBeVisible()
  // Item 6.10 — the credit leads to the passage, not the story's front page.
  await expect(page.getByRole('link', { name: 'The logbook' })).toHaveAttribute(
    'href',
    /\/c\/1\/1$/,
  )

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
