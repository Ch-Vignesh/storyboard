import { prisma } from '@storyboard/db'
import { expect, test, type Page } from '@playwright/test'

import { signIn, signUpAndOnboard } from './helpers'

/**
 * Phase 6's three exit criteria:
 *
 * - A fourth submitted suggestion is refused with a clear message.
 * - Ten upheld reports suspend an account.
 * - A private storyboard returns 404, not 403, to a signed-in stranger at every
 *   route including the API.
 *
 * The middle one needs an administrator, and there is no interface for making
 * somebody one — by design: `isAdmin` is set in the database by whoever runs
 * the deployment. So that one flag is set directly here, and everything after
 * it goes through the real screens.
 */

const PASSWORD = 'a-long-enough-passphrase'

const ASK =
  'The section under this request is meant to turn on a single decision the narrator makes without admitting to herself that she is making it, and at the moment it simply reports what happens in order, which is why it is falling flat and reads like minutes of a meeting rather than a turning point.'

const PRE_CONTEXT =
  'Ruth has been the harbourmaster of a small northern port for eleven years, and on her first morning in the job she logged a ship as arriving. It never arrived. She has written the same entry every morning since, has never explained it to anyone, and nobody in the town has ever asked her about it, which she has come to rely on more than she would like to admit to herself or to anybody else who might think to enquire. The logbook is kept on a shelf at a height she has never changed, and she treats it as the only authority in her life she has not had to argue with.'

/** A storyboard with a written section and an open request, ready to be helped. */
async function storyboardWithRequest(page: Page, title: string) {
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
  await page.getByLabel(/what is wrong/i).fill(ASK)
  await page.getByLabel(/the story so far/i).fill(PRE_CONTEXT)
  await page.getByRole('button', { name: /open this for help/i }).click()
  await expect(page.getByRole('heading', { name: 'What happens the next morning?' })).toBeVisible()

  return { path, requestPath: new URL(page.url()).pathname }
}

/**
 * Writes and sends one suggestion on an open request, through the real
 * composer. The request asks for what comes next, so the composer opens empty
 * and the word bounds (FR-5.8) have to be met — hence a real paragraph.
 */
async function sendSuggestion(page: Page, requestPath: string, opening: string) {
  await page.goto(requestPath)
  await page.getByRole('button', { name: /write a suggestion/i }).click()
  await expect(page).toHaveURL(/\/write$/)

  const editor = page.getByRole('textbox', { name: /your suggestion/i })
  await editor.click()
  await editor.pressSequentially(
    `${opening} The lamp turned the way it always had and the clock did not, and she wrote both numbers down in two columns on the same page for the first time in eleven years of never once admitting to herself that the two might not be the same thing at all. She read them back twice, and then a third time, and then she closed the book and put it on the shelf at the height she had never changed since the first morning of the job. Outside, the tide went out the way it always had, and the ship that had never arrived did not arrive again, and nobody on the mainland wrote to ask her about any of it. In the afternoon she walked the length of the pier and back, counting nothing, and found that she had been counting anyway, which was how she knew the habit had stopped being a habit and become something else entirely. By the evening she had decided what she was going to do about it, and by the morning she had decided again, differently, and neither decision had anything to do with the ship.`,
  )

  // Filling the note blurs the editor, which commits the draft before the
  // click rather than racing it (the editor saves on blur as well as on
  // demand). FR-6.2 wants the note anyway.
  await page.getByLabel(/a note to the author/i).fill('What I think comes next.')

  const send = page.getByRole('button', { name: /send this to the author/i })
  await expect(send).toBeEnabled()
  await send.click()
  // Whether this navigates is the thing under test: an accepted send leaves the
  // composer, and a send refused by the quota stays on it with the reason. So
  // the caller asserts, not this.
}

test('a fourth submitted suggestion is refused, and says why', async ({ browser }) => {
  const authorContext = await browser.newContext()
  const authorPage = await authorContext.newPage()
  await signUpAndOnboard(authorPage)
  const { requestPath } = await storyboardWithRequest(authorPage, 'The lighthouse keeps time')
  await authorContext.close()

  const helperContext = await browser.newContext()
  const helperPage = await helperContext.newPage()
  await signUpAndOnboard(helperPage)

  // FR-13.2 with decision 0016 — three at a time for somebody who is neither
  // the owner nor a co-author.
  for (const opening of ['First.', 'Second.', 'Third.']) {
    await sendSuggestion(helperPage, requestPath, opening)
    await expect(helperPage.getByText(/waiting on the author/i).first()).toBeVisible({
      timeout: 15_000,
    })
  }

  await sendSuggestion(helperPage, requestPath, 'Fourth.')
  // The refusal names the number and says what to do about it, rather than
  // saying "rate limited".
  await expect(helperPage.getByText(/3 suggestions waiting on this storyboard/i)).toBeVisible({
    timeout: 15_000,
  })
  await expect(helperPage.getByText(/wait for a decision on one, or withdraw it/i)).toBeVisible()

  await helperContext.close()
})

test('a private storyboard is 404 to a signed-in stranger, at every route and in the API', async ({
  browser,
}) => {
  const authorContext = await browser.newContext()
  const authorPage = await authorContext.newPage()
  await signUpAndOnboard(authorPage)

  await authorPage.goto('/new')
  await authorPage.getByLabel('Title').fill('Kept to myself entirely')
  await authorPage.getByRole('button', { name: 'Fantasy', exact: true }).click()
  await authorPage.getByRole('radio', { name: /private/i }).check()
  await authorPage.getByRole('button', { name: /create and start writing/i }).click()
  await expect(authorPage).toHaveURL(/\/s\/kept-to-myself-entirely-/)
  const path = new URL(authorPage.url()).pathname
  const slug = path.split('/')[2] ?? ''
  await authorContext.close()

  const strangerContext = await browser.newContext()
  const strangerPage = await strangerContext.newPage()
  await signUpAndOnboard(strangerPage)

  // Every route this phase added, plus the ones the earlier phases did.
  for (const route of [
    path,
    `${path}/contributors`,
    `${path}/contents`,
    `${path}/settings`,
    `${path}/versions`,
    `${path}/compare`,
    `${path}/lineage`,
    `${path}/export`,
    `${path}/help/new`,
  ]) {
    const response = await strangerPage.goto(route)
    expect(response?.status(), route).toBe(404)
  }

  // And the API: a 403 would confirm the storyboard exists.
  const api = await strangerPage.request.get(`/api/export/${slug}?format=md`)
  expect(api.status()).toBe(404)

  await strangerContext.close()
})

test('ten upheld reports suspend an account, and its work stays', async ({ browser }) => {
  // The person who will be reported, and something of theirs to report.
  const targetContext = await browser.newContext()
  const targetPage = await targetContext.newPage()
  const target = await signUpAndOnboard(targetPage)

  await targetPage.goto('/new')
  await targetPage.getByLabel('Title').fill('A storyboard under review')
  await targetPage.getByRole('button', { name: 'Horror', exact: true }).click()
  await targetPage.getByRole('button', { name: /create and start writing/i }).click()
  await expect(targetPage).toHaveURL(/\/s\/a-storyboard-under-review-/)
  const targetPath = new URL(targetPage.url()).pathname
  await targetContext.close()

  const targetUser = await prisma.user.findFirstOrThrow({
    where: { username: target.username },
    select: { id: true },
  })
  const storyboard = await prisma.storyboard.findFirstOrThrow({
    where: { ownerId: targetUser.id },
    select: { id: true },
  })

  // Nine upheld reports already on file, from nine different people: FR-13.5
  // deduplicates per reporter, so one person cannot do this alone. Seeded
  // rather than clicked, because the point of the test is the tenth.
  const reporters = await Promise.all(
    Array.from({ length: 9 }, (_, index) =>
      prisma.user.create({
        data: {
          email: `brigade-${String(Date.now())}-${String(index)}@storyboard.invalid`,
          username: `brigade-${String(Date.now()).slice(-7)}-${String(index)}`,
          emailVerifiedAt: new Date(),
          onboardedAt: new Date(),
        },
        select: { id: true },
      }),
    ),
  )
  await prisma.report.createMany({
    data: reporters.map((reporter) => ({
      reporterId: reporter.id,
      targetType: 'STORYBOARD' as const,
      targetId: storyboard.id,
      category: 'SPAM' as const,
      state: 'UPHELD' as const,
      resolvedAt: new Date(),
    })),
  })

  // The tenth reporter is a real person going through the real screen.
  const reporterContext = await browser.newContext()
  const reporterPage = await reporterContext.newPage()
  await signUpAndOnboard(reporterPage)

  await reporterPage.goto(`${targetPath}/contributors`)
  await reporterPage.getByRole('button', { name: /report this storyboard/i }).click()
  await reporterPage.getByRole('radio', { name: /spam/i }).check()
  await reporterPage.getByRole('button', { name: /send the report/i }).click()
  await expect(reporterPage.getByText(/nobody is told who reported what/i)).toBeVisible()

  // Reporting the same thing again is not an error and does not double-count.
  await reporterPage.reload()
  await reporterPage.getByRole('button', { name: /report this storyboard/i }).click()
  await reporterPage.getByRole('radio', { name: /spam/i }).check()
  await reporterPage.getByRole('button', { name: /send the report/i }).click()
  await expect(reporterPage.getByText(/already reported this/i)).toBeVisible()
  await reporterContext.close()

  // An administrator upholds it. `isAdmin` has no interface by design.
  const adminContext = await browser.newContext()
  const adminPage = await adminContext.newPage()
  const admin = await signUpAndOnboard(adminPage)
  await prisma.user.update({
    where: { email: admin.email },
    data: { isAdmin: true },
  })
  // The flag is read per request, so a new session is not needed — but signing
  // in again proves that too.
  await adminPage.goto('/admin')
  await expect(adminPage.getByRole('heading', { name: 'Moderation' })).toBeVisible()

  const row = adminPage.getByRole('listitem').filter({ hasText: 'A storyboard under review' })
  await expect(row).toHaveCount(1)
  await row.getByRole('button', { name: /^uphold$/i }).click()

  // FR-13.5 — that was the tenth.
  await expect(adminPage.getByText(/tenth upheld report/i)).toBeVisible({ timeout: 15_000 })
  await adminContext.close()

  const after = await prisma.user.findUniqueOrThrow({
    where: { id: targetUser.id },
    select: { status: true, suspendedAt: true },
  })
  expect(after.status).toBe('SUSPENDED')
  expect(after.suspendedAt).not.toBeNull()

  // Decision 0018 — the person is frozen, the work is not. A guest can still
  // read the storyboard, and the account cannot sign in.
  const guestContext = await browser.newContext()
  const guestPage = await guestContext.newPage()
  const response = await guestPage.goto(targetPath)
  expect(response?.status()).toBe(200)
  await expect(guestPage.getByRole('heading', { name: 'A storyboard under review' })).toBeVisible()
  await guestContext.close()

  const lockedOut = await browser.newContext()
  const lockedOutPage = await lockedOut.newPage()
  await lockedOutPage.goto('/signin')
  await lockedOutPage.getByLabel('Email').fill(target.email)
  await lockedOutPage.getByLabel('Password').fill(PASSWORD)
  await lockedOutPage.getByRole('button', { name: /sign in/i }).click()
  await expect(lockedOutPage).toHaveURL(/\/signin/)
  await lockedOut.close()

  // A non-admin gets 404 from the admin screen, not 403.
  const nosyContext = await browser.newContext()
  const nosyPage = await nosyContext.newPage()
  const nosy = await signUpAndOnboard(nosyPage)
  await signIn(nosyPage, nosy.email)
  const adminResponse = await nosyPage.goto('/admin')
  expect(adminResponse?.status()).toBe(404)
  await nosyContext.close()
})
