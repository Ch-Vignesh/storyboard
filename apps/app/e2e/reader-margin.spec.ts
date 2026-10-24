import { randomUUID } from 'node:crypto'

import { prisma } from '@storyboard/db'
import { expect, test } from '@playwright/test'

import { signUpAndOnboard } from './helpers'

/**
 * Phase 14, items 7.1 to 7.4 — the reader the prototype drew (FR-11.5,
 * FR-9.2, NFR-1): open requests in a margin of their own, tied to their
 * passages by a leader rule; chapters with open requests marked; the rest of
 * the story's requests under "Elsewhere in this story"; the contributors
 * strip; and the opening chapter's prose in the first response.
 *
 * The story is written straight to the local database, as the performance
 * flow's is, so it does not move when the seeded library changes.
 */

const PUBLIC_ID = 'margin7flow'
const SLUG = `the-margin-${PUBLIC_ID}`
const OPENING = 'The registry office kept its windows shut against the salt.'
const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

// Both projects run this file, the phone one only its last test, so the
// story is made at the file's level rather than inside the describe.
test.beforeAll(async () => {
  if (await prisma.storyboard.findUnique({ where: { publicId: PUBLIC_ID } })) return

  const person = (username: string, displayName: string) =>
    prisma.user.upsert({
      where: { email: `${username}@storyboard.invalid` },
      create: {
        email: `${username}@storyboard.invalid`,
        username,
        displayName,
        onboardedAt: new Date(),
      },
      update: {},
      select: { id: true },
    })
  const owner = await person('margin-owner', 'Maya Ferreira')
  const helper = await person('margin-helper', 'Leah Karim')

  const storyboard = await prisma.storyboard.create({
    data: {
      publicId: PUBLIC_ID,
      slug: SLUG,
      title: 'The Salt Line',
      type: 'NOVEL',
      visibility: 'PUBLIC',
      publicFrom: new Date(),
      ownerId: owner.id,
    },
    select: { id: true },
  })
  const version = await prisma.version.create({
    data: {
      storyboardId: storyboard.id,
      name: 'Main draft',
      isMain: true,
      createdById: owner.id,
    },
    select: { id: true },
  })

  const sections: Array<{ id: string; lineageId: string }> = []
  for (const [order, title] of ['Low water', 'Landfall'].entries()) {
    const chapter = await prisma.chapter.create({
      data: { versionId: version.id, lineageId: randomUUID(), order, title },
      select: { id: true },
    })
    for (let n = 0; n < 2; n += 1) {
      const text =
        order === 0 && n === 0 ? OPENING : `Chapter ${String(order + 1)}, part ${String(n + 1)}.`
      const section = await prisma.section.create({
        data: { chapterId: chapter.id, lineageId: randomUUID(), order: n, wordCount: 10 },
        select: { id: true, lineageId: true },
      })
      const revision = await prisma.revision.create({
        data: {
          sectionId: section.id,
          contentJson: doc(text),
          contentText: text,
          wordCount: 10,
          contentHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
          source: 'AUTHORED',
          authorId: owner.id,
        },
        select: { id: true },
      })
      await prisma.section.update({
        where: { id: section.id },
        data: { currentRevisionId: revision.id },
      })
      sections.push(section)
    }
  }

  const ask = 'She is meant to sound stubborn here, not petulant. I have rewritten it four times.'
  await prisma.contributionRequest.create({
    data: {
      publicId: `${PUBLIC_ID}a`,
      storyboardId: storyboard.id,
      sectionId: sections[1]!.id,
      openedById: owner.id,
      kind: 'UNBLOCK',
      title: "Ellery's answer falls flat",
      ask,
    },
  })
  await prisma.contributionRequest.create({
    data: {
      publicId: `${PUBLIC_ID}b`,
      storyboardId: storyboard.id,
      sectionId: sections[2]!.id,
      openedById: owner.id,
      kind: 'UNBLOCK',
      title: "Chapter two won't start",
      ask,
    },
  })
  await prisma.credit.create({
    data: {
      storyboardId: storyboard.id,
      contributorId: helper.id,
      type: 'PROSE',
      sectionLineage: sections[0]!.lineageId,
    },
  })
})

test.describe('the margin (items 7.1 to 7.4)', () => {
  test('the first response carries the opening chapter (7.4)', async ({ request }) => {
    const response = await request.get(`/s/${SLUG}`)
    expect(response.status()).toBe(200)
    const html = await response.text()
    expect(html).toContain(OPENING)
    // The second chapter is its own payload.
    expect(html).not.toContain('Chapter 2, part 1.')
  })

  test('cards sit in the margin and light their passage (7.1)', async ({ page }) => {
    await page.goto(`/s/${SLUG}`)
    const margin = page.getByRole('complementary', { name: 'In the margin' })
    await expect(margin).toBeVisible()
    const card = margin.getByRole('button', { name: /Ellery's answer falls flat/u })
    await expect(card).toContainText('Wants ideas')
    await expect(card).toContainText('stubborn')

    const passage = page.locator('section[id^="section-"]').nth(1)
    await expect(passage).not.toHaveClass(/bg-ochre-wash/u)
    await card.hover()
    await expect(passage).toHaveClass(/bg-ochre-wash/u)
    await page.mouse.move(5, 5)
    await expect(passage).not.toHaveClass(/bg-ochre-wash/u)

    // A click takes the reader to the passage, focuses it and marks it for a
    // moment; the mark then clears by itself.
    await card.click()
    await page.mouse.move(5, 5)
    await expect(passage).toBeFocused()
    await expect(passage).toHaveClass(/bg-ochre-wash/u)
    await expect(passage).not.toHaveClass(/bg-ochre-wash/u, { timeout: 5_000 })

    // Keyboard focus lights it too.
    await card.focus()
    await expect(passage).toHaveClass(/bg-ochre-wash/u)
  })

  test('other chapters with open requests are marked and listed (7.2)', async ({ page }) => {
    await page.goto(`/s/${SLUG}`)
    const rail = page.getByRole('navigation', { name: 'Contents' })
    // Chrome puts a space before a visually hidden span; a screen reader
    // reads the pause the same.
    await expect(rail.getByRole('link', { name: /^2\. Landfall\s*, open for help/u })).toBeVisible()
    await expect(
      rail.getByRole('link', { name: /^1\. Low water\s*, open for help/u }),
    ).toBeVisible()

    const margin = page.getByRole('complementary', { name: 'In the margin' })
    const elsewhere = margin.getByRole('link', { name: "Chapter two won't start" })
    await expect(elsewhere).toHaveAttribute('href', `/s/${SLUG}/c/2/1`)
    await elsewhere.click()
    await expect(page).toHaveURL(new RegExp(`/s/${SLUG}/c/2/1$`, 'u'))
    await expect(
      page.getByRole('complementary', { name: 'In the margin' }).getByRole('button', {
        name: /Chapter two won't start/u,
      }),
    ).toBeVisible()
  })

  test('the contributors strip names who helped (7.3)', async ({ page }) => {
    await page.goto(`/s/${SLUG}`)
    const margin = page.getByRole('complementary', { name: 'In the margin' })
    await expect(margin.getByRole('link', { name: 'Leah Karim' })).toBeVisible()
    await expect(margin).toContainText('chapter 1, accepted')
    await margin.getByRole('link', { name: 'All contributors' }).click()
    await expect(page).toHaveURL(new RegExp(`/s/${SLUG}/contributors$`, 'u'))
  })

  test('a reader who is not an author can report the story from it (7.8)', async ({ page }) => {
    // A guest is asked to sign in first.
    await page.goto(`/s/${SLUG}`)
    await page.getByRole('link', { name: 'Report this story' }).click()
    await expect(page).toHaveURL(/#report$/u)
    await expect(page.getByRole('link', { name: 'Sign in to report this story' })).toBeVisible()

    await signUpAndOnboard(page)
    await page.goto(`/s/${SLUG}#report`)
    const report = page.getByRole('region', { name: 'Report this story' })
    await report.getByRole('button', { name: 'Report this story' }).click()
    await report.getByRole('radio', { name: /Spam/u }).check()
    await report.getByRole('button', { name: 'Send the report' }).click()
    await expect(report).toContainText('Reported.')

    // The same reader, later, is told rather than offered the form again.
    await page.reload()
    await expect(page.getByRole('region', { name: 'Report this story' })).toContainText(
      'You have already reported this.',
    )
  })

  test('prints as its text (7.9)', async ({ page }) => {
    await page.goto(`/s/${SLUG}`)
    await expect(page.getByRole('complementary', { name: 'In the margin' })).toBeVisible()
    await page.emulateMedia({ media: 'print' })
    await expect(page.getByRole('complementary', { name: 'In the margin' })).toBeHidden()
    await expect(page.getByRole('navigation', { name: 'Contents' })).toBeHidden()
    await expect(page.getByRole('button', { name: 'Reading' })).toBeHidden()
    await expect(page.getByRole('link', { name: 'Landfall →' })).toBeHidden()
    await expect(page.getByText(OPENING)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'The Salt Line' })).toBeVisible()
  })

  test('the request page leads to its passage (7.2)', async ({ page }) => {
    await page.goto(`/s/${SLUG}/help/${PUBLIC_ID}b`)
    await page.getByRole('link', { name: 'Read it in the story' }).click()
    await expect(page).toHaveURL(new RegExp(`/s/${SLUG}/c/2/1$`, 'u'))
  })
})

test('below the margin width, cards sit under their sections @mobile', async ({ page }) => {
  await page.goto(`/s/${SLUG}`)
  await expect(page.getByRole('complementary', { name: 'In the margin' })).toBeHidden()
  await expect(page.getByRole('button', { name: /Ellery's answer falls flat/u })).toBeVisible()
  // What the margin ends with follows the text instead.
  await expect(page.getByRole('link', { name: "Chapter two won't start" })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Leah Karim' })).toBeVisible()
})
