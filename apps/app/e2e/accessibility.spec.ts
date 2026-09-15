import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { signUpAndOnboard } from './helpers'

/**
 * The automated half of the accessibility audit (NFR-4, phase 8 task 7).
 *
 * **What this can and cannot claim.** Automated checking finds somewhere around
 * a third of WCAG failures — the mechanical ones: contrast, names on controls,
 * labels on inputs, heading order, landmark structure, ARIA that contradicts
 * itself. It cannot tell you whether the reading order makes sense, whether a
 * live region announces at a useful moment, or whether the comparison view is
 * comprehensible without colour. So this file is the floor, not the claim. The
 * product should not say "WCAG 2.2 AA" until somebody has been through the
 * reader, the editor and the request flow with a screen reader, which is a task
 * in phase 8 that no test file can close.
 *
 * Every violation is a failure, with no allowlist. An allowlist in the first
 * version of this file is a permanent one: the entries outlive the reasons.
 */

/** WCAG 2.2 A and AA, which is what NFR-4 names. Best-practice rules are advice. */
const STANDARD = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function scan(page: Page, description: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(STANDARD).analyze()

  // Playwright's diff on a failed array comparison is unreadable for this
  // shape, and the one thing somebody fixing this needs is which element.
  const report = violations
    .map((violation) => {
      const where = violation.nodes
        .slice(0, 4)
        .map((node) => `      ${node.target.join(' ')}`)
        .join('\n')
      return `  [${violation.impact ?? 'unknown'}] ${violation.id}: ${violation.help}\n${where}\n      ${violation.helpUrl}`
    })
    .join('\n\n')

  expect(violations.length, `${description}\n\n${report}\n`).toBe(0)
}

test.describe('what a machine can check (NFR-4)', () => {
  test.describe('signed out', () => {
    test('the marketing entry points and the sign-up path', async ({ page }) => {
      for (const path of ['/signup', '/signin', '/browse', '/rules']) {
        await page.goto(path)
        await scan(page, `${path} has accessibility violations`)
      }
    })

    test('the reader, which is the screen strangers meet first', async ({ page }) => {
      await page.goto('/s/pride-and-prejudice-seedpride01')
      await scan(page, 'the reader has accessibility violations')
    })

    test('an open request, the thing the product exists to show', async ({ page }) => {
      await page.goto('/s/pride-and-prejudice-seedpride01')
      const request = page.getByRole('link', { name: /stuck|help|suggest/i }).first()
      if (await request.count()) {
        await request.click()
        await scan(page, 'the request page has accessibility violations')
      }
    })
  })

  test.describe('signed in', () => {
    test('the dashboard, the editor and the import screen', async ({ page }) => {
      await signUpAndOnboard(page)
      await scan(page, 'the dashboard has accessibility violations')

      await page.goto('/new')
      await scan(page, 'the new-storyboard form has accessibility violations')

      await page.goto('/import')
      await scan(page, 'the import screen has accessibility violations')
    })
  })
})
