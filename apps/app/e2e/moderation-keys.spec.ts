import { grantAdmin, prisma } from '@storyboard/db'
import { expect, test } from '@playwright/test'

import { signUpAndOnboard } from './helpers'

/**
 * FR-13.7 (phase 14, item 9.3) — the report queue worked from the keyboard:
 * j and k move, d dismisses, u upholds, o opens what was reported, and after
 * a decision the focus is already on the next report.
 *
 * The administrator is made as flow 8 makes one (decision 0043: there is no
 * screen for it), and two reports are filed directly, dated before anything
 * else in the queue so they lead it; everything after that is the real screen.
 */
test('a moderator works the queue without the mouse', async ({ page, context }) => {
  const admin = await signUpAndOnboard(page)
  await grantAdmin(prisma, admin.email)

  const stamp = String(Date.now())
  const reporter = await prisma.user.create({
    data: {
      email: `keys-${stamp}@storyboard.invalid`,
      username: `keys-${stamp.slice(-8)}`,
      emailVerifiedAt: new Date(),
      onboardedAt: new Date(),
    },
    select: { id: true },
  })
  const reported = await prisma.user.findFirstOrThrow({
    where: { username: admin.username },
    select: { id: true },
  })
  const filed: Array<{ id: string }> = []
  for (const [index, note] of [`First to go ${stamp}`, `Second to go ${stamp}`].entries()) {
    filed.push(
      await prisma.report.create({
        data: {
          reporterId: reporter.id,
          targetType: index === 0 ? 'USER' : 'STORYBOARD',
          targetId: index === 0 ? reported.id : `no-such-story-${stamp}`,
          category: 'SPAM',
          note,
          createdAt: new Date(Date.UTC(2000, 0, 1, 0, 0, index)),
        },
        select: { id: true },
      }),
    )
  }

  await page.goto('/admin/reports')
  // The legend, where the keys are used.
  await expect(page.getByText(/j.*and.*k.*move between reports/u)).toBeVisible()
  const reports = page.getByRole('list', { name: 'Reports' }).locator(':scope > li')
  const first = reports.filter({ hasText: `First to go ${stamp}` })
  const second = reports.filter({ hasText: `Second to go ${stamp}` })
  await expect(first.getByRole('button', { name: 'Uphold', exact: true })).toHaveAttribute(
    'aria-keyshortcuts',
    'u',
  )
  await expect(first.getByRole('button', { name: 'Dismiss' })).toHaveAttribute(
    'aria-keyshortcuts',
    'd',
  )

  // In, then down and back up.
  await first.click({ position: { x: 4, y: 4 } })
  await expect(first).toBeFocused()
  await page.keyboard.press('j')
  await expect(second).toBeFocused()
  await page.keyboard.press('k')
  await expect(first).toBeFocused()

  // The profile it is about opens beside the queue.
  const opened = context.waitForEvent('page')
  await page.keyboard.press('o')
  const profile = await opened
  await expect(profile).toHaveURL(new RegExp(`/@${admin.username}$`, 'u'))
  await profile.close()

  // d dismisses; the next report takes its place, and the focus.
  await page.keyboard.press('d')
  await expect(page.getByRole('status').filter({ hasText: /^Dismissed:/u })).toBeVisible()
  await expect(first).toHaveCount(0)
  await expect(second).toBeFocused()

  // u upholds it.
  await page.keyboard.press('u')
  await expect(page.getByRole('status').filter({ hasText: /^Upheld:/u })).toBeVisible()
  await expect(second).toHaveCount(0)

  const states = await prisma.report.findMany({
    where: { id: { in: filed.map((report) => report.id) } },
    select: { id: true, state: true },
  })
  expect(states.find((report) => report.id === filed[0]?.id)?.state).toBe('DISMISSED')
  expect(states.find((report) => report.id === filed[1]?.id)?.state).toBe('UPHELD')
})
