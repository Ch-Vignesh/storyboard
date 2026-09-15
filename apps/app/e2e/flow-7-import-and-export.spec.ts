import { AlignmentType, Document, Packer, Paragraph, TextRun } from 'docx'
import { expect, test } from '@playwright/test'

import { signUpAndOnboard } from './helpers'

/**
 * Phase 5's exit criterion, in full:
 *
 * > Import a real 80,000-word .docx with no heading styles, correct the
 * > proposed boundaries in under two minutes, export it back out with
 * > contributors intact.
 *
 * The file is built here rather than checked in, so the test is honest about
 * what it is reading — 20 chapters typed the way writers actually type them,
 * with no styles at all, chapter names as ordinary centred paragraphs and
 * scenes divided by asterisks. It goes through the real upload, the real
 * parser, the real review screen and the real export route.
 */

const SENTENCE = 'The harbour had been empty for a year before she noticed the difference in it.'

/** FR-5.3 sets minimums on both of these; they are what a real request holds. */
const ASK =
  'The last line of this section is meant to land as the moment she stops pretending the logbook is somebody else problem, and at the moment it simply states where she is standing, which reads like a stage direction rather than a decision she has finally made about her own life.'

const PRE_CONTEXT =
  'She has kept the lamp record for eleven years, and for the last fortnight the turns have not agreed with the clock in the office. The clock has been wrong before and nobody has ever minded, because the mainland stopped writing back long ago and the record is read by nobody but her. What has changed is that she has begun to write down both numbers, the one the lamp gives and the one the clock gives, in two columns on the same page, which is the first time in eleven years that she has admitted on paper that the two might not be the same thing at all.'

/** A manuscript with no heading styles, the way most of them arrive. */
async function manuscriptWithNoStyles(
  chapters: number,
  paragraphsPerScene: number,
): Promise<Buffer> {
  const children: Paragraph[] = []
  for (let index = 1; index <= chapters; index += 1) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun(`Chapter ${String(index)}`)],
      }),
    )
    for (const half of [0, 1]) {
      for (let line = 0; line < paragraphsPerScene; line += 1) {
        children.push(
          new Paragraph({
            children: [
              new TextRun(`${SENTENCE} (${String(index)}.${String(half)}.${String(line)})`),
            ],
          }),
        )
      }
      if (half === 0) children.push(new Paragraph({ children: [new TextRun('***')] }))
    }
  }
  return Packer.toBuffer(new Document({ sections: [{ children }] }))
}

test('a writer brings an 80,000-word manuscript in and takes it back out', async ({ page }) => {
  await signUpAndOnboard(page)

  // ── FR-3.7: what survives is on the screen before a file is chosen.
  await page.goto('/import')
  await expect(page.getByRole('heading', { name: /bring a manuscript in/i })).toBeVisible()
  await expect(page.getByText('Fonts, sizes, colours, line spacing')).toBeVisible()
  await expect(page.getByText(/nothing here uses a language model/i)).toBeVisible()

  // ── FR-3.1, FR-3.2: upload and propose.
  const file = await manuscriptWithNoStyles(20, 130)
  expect(file.byteLength).toBeLessThan(5 * 1024 * 1024)

  await page.getByLabel('Your manuscript').setInputFiles({
    name: 'the-ship-never-lands.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: file,
  })

  // The clock the exit criterion cares about starts when the proposal appears.
  await expect(page.getByRole('heading', { name: /is this where the chapters are/i })).toBeVisible({
    timeout: 60_000,
  })
  const reviewStarted = Date.now()

  // ── FR-3.3, FR-3.5: what it found, and how, in words rather than a number.
  await expect(page.getByText(/read as 20 chapters/i)).toBeVisible()
  await expect(page.getByText(/from a line that says "chapter"/i)).toBeVisible()
  await expect(page.getByText(/\d{2},\d{3} words/)).toBeVisible()

  // ── FR-3.2: correct the boundaries. Two corrections, both by hand.
  const chapters = page.getByRole('listitem').filter({ has: page.getByRole('textbox') })
  await expect(chapters).toHaveCount(20)

  // 1. The second chapter was not a new chapter after all.
  await chapters
    .nth(1)
    .getByRole('button', { name: /join to the one above/i })
    .click()
  await expect(chapters).toHaveCount(19)

  // 2. Rename the first chapter to something a reader would recognise.
  const firstTitle = chapters.first().getByRole('textbox')
  await firstTitle.fill('The harbour')

  // 3. Split a section in two, which is the other correction the review
  //    screen exists for. The first chapter is open already.
  await expect(chapters.first().getByRole('button', { name: /^hide$/i })).toBeVisible()
  const sectionsBefore = await chapters
    .first()
    .getByRole('button', { name: /split this in two/i })
    .count()
  await chapters
    .first()
    .getByRole('button', { name: /split this in two/i })
    .first()
    .click()
  await expect(
    chapters.first().getByRole('button', { name: /split this in two/i }),
  ).not.toHaveCount(sectionsBefore)

  // ── Everything a storyboard needs that a file cannot say.
  await page.getByLabel('Title').fill('The ship never lands')
  await page.getByRole('button', { name: 'Literary fiction', exact: true }).click()
  await page.getByRole('button', { name: /this is right/i }).click()

  await expect(page).toHaveURL(/\/s\/the-ship-never-lands-/, { timeout: 60_000 })
  const slug = new URL(page.url()).pathname.split('/')[2] ?? ''

  // Correcting the boundaries is the part a person does; two minutes is the
  // budget the exit criterion sets for it.
  expect(Date.now() - reviewStarted).toBeLessThan(120_000)

  // ── The manuscript is in, and the corrections held.
  await expect(page.getByRole('heading', { name: 'The ship never lands' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'The harbour' })).toBeVisible()
  await expect(page.getByText(/the harbour had been empty for a year/i).first()).toBeVisible()

  await page.goto(`/s/${slug}/contents`)
  // 20 chapters, less the one joined to its neighbour. The names are editable
  // here, so they are values rather than text.
  const names = page.getByRole('textbox', { name: /chapter \d+ name/i })
  await expect(names).toHaveCount(19)
  await expect(names.first()).toHaveValue('The harbour')
  // The second chapter's boundary was removed, so what follows is chapter 3.
  await expect(names.nth(1)).toHaveValue('Chapter 3')
  await expect(names.last()).toHaveValue('Chapter 20')

  // ── FR-14: take it back out, with the front matter FR-14.3 requires.
  await page.goto(`/s/${slug}/export`)
  await expect(page.getByRole('heading', { name: /take it out/i })).toBeVisible()
  await expect(page.getByText('Word (.docx)')).toBeVisible()
  // .fountain is for screenplays; this is a novel.
  await expect(page.getByText('Fountain (.fountain)')).toHaveCount(0)

  const markdown = await page.request.get(`/api/export/${slug}?format=md`)
  expect(markdown.ok()).toBe(true)
  expect(markdown.headers()['content-disposition']).toContain('the-ship-never-lands.md')

  const text = await markdown.text()
  expect(text).toContain('# The ship never lands')
  expect(text).toContain('## The harbour')
  expect(text).toContain('The harbour had been empty for a year')
  // FR-14.3 — the source line is part of the file, not an option.
  expect(text).toContain('Written on Storyboard')
  expect(text).toContain(`/s/${slug}`)

  const docx = await page.request.get(`/api/export/${slug}?format=docx`)
  expect(docx.ok()).toBe(true)
  expect(docx.headers()['content-type']).toContain('wordprocessingml')
  expect((await docx.body()).byteLength).toBeGreaterThan(10_000)

  const pdf = await page.request.get(`/api/export/${slug}?format=pdf`)
  expect(pdf.ok()).toBe(true)
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-')
})

test('a finished storyboard reads as the work rather than the workshop', async ({ page }) => {
  await signUpAndOnboard(page)

  await page.goto('/new')
  await page.getByLabel('Title').fill('The lighthouse keeps time')
  await page.getByRole('button', { name: 'Literary fiction', exact: true }).click()
  await page.getByRole('button', { name: /create and start writing/i }).click()
  await expect(page).toHaveURL(/\/s\//)
  const path = new URL(page.url()).pathname

  await page.getByRole('link', { name: 'Edit' }).first().click()
  const editor = page.getByRole('textbox', { name: /section text/i })
  await editor.click()
  await editor.pressSequentially('She counted the lamp turns until they stopped agreeing.')
  await page.getByRole('button', { name: /save now/i }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()

  // FR-5.1 — a request open at the moment the author calls it finished.
  await page.goto(`${path}/help/new`)
  // 'Rewrite this' needs 150 words in the section first, and this one is a
  // paragraph long — so the request is for what comes after it.
  await page.getByRole('button', { name: /write what comes next/i }).click()
  await page.getByLabel('Title').fill('Does the ending land?')
  await page.getByLabel(/what is wrong/i).fill(ASK)
  await page.getByLabel(/the story so far/i).fill(PRE_CONTEXT)
  const open = page.getByRole('button', { name: /open this for help/i })
  await expect(open).toBeEnabled()
  await open.click()
  await expect(page.getByRole('heading', { name: 'Does the ending land?' })).toBeVisible()

  // ── FR-14.1 — the switch, and what it says before it is thrown.
  await page.goto(`${path}/export`)
  await page.getByRole('button', { name: /^mark it finished$/i }).click()
  await expect(page.getByText(/closes any request still open/i)).toBeVisible()
  await page.getByRole('button', { name: /^mark it finished$/i }).click()
  await expect(page.getByText(/marked finished/i)).toBeVisible()

  // The reading page: no margin, no request cards, contributors at the foot.
  await page.goto(path)
  await expect(page.getByText(/^Finished /)).toBeVisible()
  await expect(page.getByRole('link', { name: /everyone who helped write this/i })).toBeVisible()
  await expect(page.getByRole('link', { name: /ask for help/i })).toHaveCount(0)
  await expect(page.getByText('Does the ending land?')).toHaveCount(0)

  // ── And it is reversible, because a finished novel with a typo is ordinary.
  await page.goto(`${path}/export`)
  await page.getByRole('button', { name: /actually, there is more to do/i }).click()
  await expect(page.getByRole('button', { name: /^mark it finished$/i })).toBeVisible()
})
