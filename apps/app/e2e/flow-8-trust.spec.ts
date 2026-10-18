import { grantAdmin, prisma } from '@storyboard/db'
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
 * somebody one — by design (decision 0043): the one admin is set from the
 * command line by whoever runs the deployment. So the function behind that
 * command is called directly here, and everything after it goes through the
 * real screens.
 */

const PASSWORD = 'A-long-enough-passphrase-1!'

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

  // Item 6.4 — the fourth is known before it is written: the request page
  // says the three are waiting, the draft still opens, and Send is off with
  // the reason rather than a refusal after the fact (the server still
  // refuses; the integrity tests hold it to that).
  await helperPage.goto(requestPath)
  await expect(
    helperPage.getByText(/3 of your 3 suggestions waiting on this story/i).first(),
  ).toBeVisible()
  await expect(
    helperPage.getByText(/you can write now and send when one of your 3 is decided/i).first(),
  ).toBeVisible()
  await helperPage.getByRole('button', { name: /write a suggestion/i }).click()
  await expect(helperPage).toHaveURL(/\/write$/)
  await helperPage
    .getByRole('textbox', { name: /your suggestion/i })
    .pressSequentially('Fourth. The lamp turned the way it always had and the clock did not.')
  await expect(helperPage.getByRole('button', { name: /send this to the author/i })).toBeDisabled()
  await expect(
    helperPage.getByText(/you can write now and send when one of your 3 is decided/i).first(),
  ).toBeVisible()

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
  // Ten reporters sign in one after another, each leaving by the header first
  // (item 3.11): three times the usual budget.
  test.slow()
  // The person who will be reported, and something of theirs to report.
  const targetContext = await browser.newContext()
  const targetPage = await targetContext.newPage()
  const target = await signUpAndOnboard(targetPage)
  // Its own title: the queue is shared with every earlier run against this
  // database, and a run that stopped part-way leaves its report open.
  const title = `A story under review ${String(Date.now())}`

  await targetPage.goto('/new')
  await targetPage.getByLabel('Title').fill(title)
  await targetPage.getByRole('button', { name: 'Horror', exact: true }).click()
  await targetPage.getByRole('button', { name: /create and start writing/i }).click()
  await expect(targetPage).toHaveURL(/\/s\/a-story-under-review-/)
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
  await reporterPage.getByRole('button', { name: /report this story/i }).click()
  await reporterPage.getByRole('radio', { name: /spam/i }).check()
  await reporterPage.getByRole('button', { name: /send the report/i }).click()
  await expect(reporterPage.getByText(/nobody is told who reported what/i)).toBeVisible()

  // Coming back, they are told they reported it, rather than offered a form
  // whose report would only be swallowed (the server still takes a second
  // one as a duplicate, without counting it: integrity.test.ts).
  await reporterPage.reload()
  await expect(reporterPage.getByText(/already reported this/i)).toBeVisible()
  await expect(reporterPage.getByRole('button', { name: /report this story/i })).toHaveCount(0)
  await reporterContext.close()

  // An administrator upholds it. The role has no interface by design: what
  // `pnpm admin:grant` does, this does, and whoever was the admin of this
  // database before is demoted by it.
  const adminContext = await browser.newContext()
  const adminPage = await adminContext.newPage()
  const admin = await signUpAndOnboard(adminPage)
  await grantAdmin(prisma, admin.email)
  // The role is read per request, so a new session is not needed — but signing
  // in again proves that too.
  await adminPage.goto('/admin/reports')
  await expect(adminPage.getByRole('heading', { name: 'Reports' })).toBeVisible()
  // Item 2b.7 — the panel's frame: the screens down the side, and "Admin" in
  // the header, for someone who may open them.
  const screens = adminPage.getByRole('navigation', { name: 'Admin screens' })
  await expect(screens.getByRole('link', { name: 'People' })).toBeVisible()
  await expect(screens.getByRole('link', { name: 'Reports' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await expect(adminPage.getByRole('link', { name: 'Admin', exact: true })).toBeVisible()

  const row = adminPage.getByRole('listitem').filter({ hasText: title })
  await expect(row).toHaveCount(1)
  await row.getByRole('button', { name: /^uphold$/i }).click()

  // FR-13.5 — that was the tenth.
  await expect(adminPage.getByText(/tenth upheld report/i)).toBeVisible({ timeout: 15_000 })

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
  await expect(guestPage.getByRole('heading', { name: title })).toBeVisible()
  await guestContext.close()

  const lockedOut = await browser.newContext()
  const lockedOutPage = await lockedOut.newPage()
  await lockedOutPage.goto('/signin')
  await lockedOutPage.getByLabel('Email').fill(target.email)
  await lockedOutPage.getByLabel('Password').fill(PASSWORD)
  await lockedOutPage.getByRole('button', { name: /sign in/i }).click()
  await expect(lockedOutPage).toHaveURL(/\/signin/)
  // Decision 0018 (phase 14, item 1.15) — after a correct password, told so,
  // and where to write. It read "do not match" until then.
  await expect(lockedOutPage.getByText(/this account is suspended/i)).toBeVisible()
  await lockedOut.close()

  // "Pending review": the review lifts it, from the People screen (item
  // 2b.7). Nothing listed suspended accounts until the 2026-10-16 spec review.
  await adminPage.goto('/admin/people')
  const suspendedRow = adminPage
    .getByRole('listitem')
    .filter({ hasText: target.username })
    .filter({ has: adminPage.getByRole('button', { name: /lift the suspension/i }) })
  await suspendedRow.getByRole('button', { name: /lift the suspension/i }).click()
  await expect(suspendedRow).toHaveCount(0)
  expect(
    (
      await prisma.user.findUniqueOrThrow({
        where: { id: targetUser.id },
        select: { status: true },
      })
    ).status,
  ).toBe('ACTIVE')

  // Decision 0043 (phase 14, item 2b.5) — the People screen. The account is
  // found by its exact username, banned with a note, and a ban is what "Lift
  // the suspension" cannot undo; lifting the ban makes it active again.
  await adminPage.goto('/admin/people')
  await adminPage.getByLabel(/username or email address/i).fill(target.username)
  await adminPage.getByRole('button', { name: /find the account/i }).click()
  const card = adminPage.getByRole('article', { name: target.username })
  await expect(card.getByText('Active', { exact: true })).toBeVisible()
  await card.getByRole('button', { name: 'Ban', exact: true }).click()
  await card.getByLabel(/note, for administrators/i).fill('Spam across three stories.')
  await card.getByRole('button', { name: /ban this account/i }).click()
  await expect(card.getByText(/^Banned /)).toBeVisible()
  const banned = await prisma.user.findUniqueOrThrow({
    where: { id: targetUser.id },
    select: { status: true, bannedAt: true, standingNote: true },
  })
  expect(banned.status).toBe('SUSPENDED')
  expect(banned.bannedAt).not.toBeNull()
  expect(banned.standingNote).toBe('Spam across three stories.')

  await card.getByRole('button', { name: /lift the ban/i }).click()
  await expect(card.getByText('Active', { exact: true })).toBeVisible()
  expect(
    (
      await prisma.user.findUniqueOrThrow({
        where: { id: targetUser.id },
        select: { status: true, bannedAt: true },
      })
    ).bannedAt,
  ).toBeNull()

  // Item 2.7 (decision 0045) — from the Upheld tab, the story the reports were
  // about can be hidden: a guest then finds nothing at its address, and
  // "Show it again" brings it back. Nothing is deleted.
  await adminPage.goto('/admin/reports')
  await adminPage.getByRole('button', { name: /^Upheld/ }).click()
  const upheldRow = adminPage.getByRole('listitem').filter({ hasText: title }).first()
  await upheldRow.getByRole('button', { name: 'Hide it' }).click()
  await expect(upheldRow.getByText('hidden', { exact: true })).toBeVisible()
  const hiddenContext = await browser.newContext()
  const hiddenPage = await hiddenContext.newPage()
  expect((await hiddenPage.goto(targetPath))?.status()).toBe(404)
  await hiddenContext.close()

  await upheldRow.getByRole('button', { name: 'Show it again' }).click()
  await expect(upheldRow.getByText('hidden', { exact: true })).toHaveCount(0)
  const shownContext = await browser.newContext()
  const shownPage = await shownContext.newPage()
  expect((await shownPage.goto(targetPath))?.status()).toBe(200)
  await shownContext.close()
  await adminContext.close()

  // A non-admin gets 404 from the admin screen, not 403.
  const nosyContext = await browser.newContext()
  const nosyPage = await nosyContext.newPage()
  const nosy = await signUpAndOnboard(nosyPage)
  await signIn(nosyPage, nosy.email)
  const adminResponse = await nosyPage.goto('/admin')
  expect(adminResponse?.status()).toBe(404)
  await nosyContext.close()
})

/**
 * Decision 0046 (phase 14, item 2.9; D-9) — blocking a person. The author
 * blocks from the helper's profile and reads what a block does first; the
 * helper still reads the story, finds a sentence where the button was, and
 * settings lists the block with the way back.
 */
test('someone you block can still read, and cannot help', async ({ browser }) => {
  const authorContext = await browser.newContext()
  const authorPage = await authorContext.newPage()
  await signUpAndOnboard(authorPage)
  const { path, requestPath } = await storyboardWithRequest(authorPage, 'The weir in winter')

  const helperContext = await browser.newContext()
  const helperPage = await helperContext.newPage()
  const helper = await signUpAndOnboard(helperPage)
  await helperPage.goto(requestPath)
  await expect(helperPage.getByRole('button', { name: /write a suggestion/i })).toBeVisible()

  await authorPage.goto(`/@${helper.username}`)
  await authorPage.getByRole('button', { name: /^Block / }).click()
  await expect(authorPage.getByText(/they can still read your stories/i)).toBeVisible()
  await authorPage.getByRole('button', { name: /^Block / }).click()
  await expect(authorPage.getByText(/you have blocked/i)).toBeVisible()

  await helperPage.goto(requestPath)
  await expect(helperPage.getByRole('button', { name: /write a suggestion/i })).toHaveCount(0)
  await expect(helperPage.getByText(/taking suggestions from you/i)).toBeVisible()
  expect((await helperPage.goto(path))?.status()).toBe(200)

  await authorPage.goto('/settings')
  await expect(authorPage.getByRole('heading', { name: 'Blocked people' })).toBeVisible()
  await authorPage.getByRole('button', { name: 'Unblock' }).click()
  await expect(authorPage.getByText(/^Nobody\./)).toBeVisible()

  await helperPage.goto(requestPath)
  await expect(helperPage.getByRole('button', { name: /write a suggestion/i })).toBeVisible()
  await authorContext.close()
  await helperContext.close()
})
