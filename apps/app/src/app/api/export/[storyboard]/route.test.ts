/**
 * Phase 14, item 8.8 (FR-14.2, FR-14.3) — export what you need, with a good
 * file name: one chapter or the whole story, the main draft or an alternate,
 * named `{slug or "story"}-{yyyy-mm-dd}[-chapter-n][-version]` with the real
 * title in RFC 5987's `filename*`, and the contributors page in every file.
 * Needs a real Postgres, so it skips when DATABASE_URL is unset. CI runs it.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

type Session = {
  user: { id: string; username: string | null; onboarded: boolean }
  expires: string
}

const state = vi.hoisted(() => ({ session: null as Session | null }))
vi.mock('@/auth', () => ({ auth: async () => state.session }))

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('GET /api/export/[storyboard] (item 8.8)', () => {
  let db: PrismaClient
  const people: string[] = []
  const stories: string[] = []
  const run = randomUUID().replaceAll('-', '').slice(0, 8)
  let owner = { id: '', username: '' }
  let story = { slug: '', alternateId: '' }
  let hindiSlug = ''

  async function person(label: string) {
    const username = `ep-${label}-${run}`
    const row = await db.user.create({
      data: { email: `${username}@example.test`, username, displayName: `Ep ${label}` },
      select: { id: true },
    })
    people.push(row.id)
    return { id: row.id, username }
  }

  const paragraph = (text: string) => ({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  })

  /** A version's chapters, each with one written section. */
  async function chaptersIn(versionId: string, chapters: Array<[string, string]>) {
    for (const [order, [title, text]] of chapters.entries()) {
      const chapter = await db.chapter.create({
        data: { versionId, lineageId: randomUUID(), order, title },
        select: { id: true },
      })
      const section = await db.section.create({
        data: { chapterId: chapter.id, lineageId: randomUUID(), order: 0, wordCount: 4 },
        select: { id: true },
      })
      const revision = await db.revision.create({
        data: {
          sectionId: section.id,
          contentJson: paragraph(text),
          contentText: text,
          wordCount: 4,
          contentHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
          source: 'AUTHORED',
          authorId: owner.id,
        },
        select: { id: true },
      })
      await db.section.update({
        where: { id: section.id },
        data: { currentRevisionId: revision.id },
      })
    }
  }

  async function aStory(title: string) {
    const tag = randomUUID().replaceAll('-', '').slice(0, 8)
    const row = await db.storyboard.create({
      data: {
        publicId: `ep${tag}`,
        slug: `export-${tag}`,
        title,
        type: 'NOVEL',
        visibility: 'PUBLIC',
        publicFrom: new Date(Date.now() - 60_000),
        ownerId: owner.id,
      },
      select: { id: true, slug: true },
    })
    stories.push(row.id)
    const main = await db.version.create({
      data: { storyboardId: row.id, name: 'Main draft', isMain: true, createdById: owner.id },
      select: { id: true },
    })
    return { ...row, mainId: main.id }
  }

  async function get(slug: string, query: string, cookie?: string) {
    const { GET } = await import('./route')
    return GET(
      new Request(`http://localhost/api/export/${slug}?${query}`, {
        headers: cookie ? { cookie } : {},
      }),
      { params: Promise.resolve({ storyboard: slug }) },
    )
  }

  beforeAll(async () => {
    db = createPrismaClient({ log: [] })
    owner = await person('owner')
    const helper = await person('helper')

    const ship = await aStory('The ship never lands')
    await chaptersIn(ship.mainId, [
      ['The harbour', 'The harbour stood empty.'],
      ['The ledger', 'She wrote it down.'],
    ])
    const alternate = await db.version.create({
      data: { storyboardId: ship.id, name: 'The other ending', createdById: owner.id },
      select: { id: true },
    })
    await chaptersIn(alternate.id, [['The harbour', 'The ship came in.']])
    await db.credit.create({
      data: { storyboardId: ship.id, contributorId: helper.id, type: 'IDEA' },
    })
    story = { slug: ship.slug, alternateId: alternate.id }

    const hindi = await aStory('दिल्ली की रातें')
    await chaptersIn(hindi.mainId, [['एक', 'रात लंबी थी और शहर जाग रहा था।']])
    hindiSlug = hindi.slug

    state.session = {
      user: { id: owner.id, username: owner.username, onboarded: true },
      expires: '',
    }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  afterAll(async () => {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`select set_config('storyboard.hard_delete', 'on', true)`)
      const where = { chapter: { version: { storyboardId: { in: stories } } } }
      await tx.credit.deleteMany({ where: { storyboardId: { in: stories } } })
      await tx.section.updateMany({ where, data: { currentRevisionId: null } })
      await tx.revision.deleteMany({ where: { section: where } })
      await tx.section.deleteMany({ where })
      await tx.chapter.deleteMany({ where: { version: { storyboardId: { in: stories } } } })
      await tx.version.deleteMany({ where: { storyboardId: { in: stories } } })
      await tx.storyboard.deleteMany({ where: { id: { in: stories } } })
      await tx.user.deleteMany({ where: { id: { in: people } } })
    })
    await db.$disconnect()
  })

  it('names the whole main draft for the story and the day, with the real title too', async () => {
    const response = await get(story.slug, 'format=md')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition')).toMatch(
      /^attachment; filename="the-ship-never-lands-\d{4}-\d{2}-\d{2}\.md"; filename\*=UTF-8''The%20ship%20never%20lands%20\d{4}-\d{2}-\d{2}\.md$/u,
    )
    const text = await response.text()
    expect(text).toContain('The harbour stood empty.')
    expect(text).toContain('She wrote it down.')
  })

  it('takes one chapter, and keeps the contributors page and the source line', async () => {
    const response = await get(story.slug, 'format=md&chapter=2')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition')).toMatch(
      /filename="the-ship-never-lands-\d{4}-\d{2}-\d{2}-chapter-2\.md"/u,
    )
    const text = await response.text()
    expect(text).toContain('## The ledger')
    expect(text).not.toContain('The harbour stood empty.')
    // FR-14.3 — not removable, a single chapter included.
    expect(text).toContain('With contributions from')
    expect(text).toContain('Ep helper')
    expect(text).toContain(`/s/${story.slug}`)
  })

  it('takes an alternate version, named as such', async () => {
    const response = await get(story.slug, `format=md&version=${story.alternateId}`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition')).toMatch(
      /filename="the-ship-never-lands-\d{4}-\d{2}-\d{2}-the-other-ending\.md"; filename\*=UTF-8''The%20ship%20never%20lands%20\d{4}-\d{2}-\d{2}%20%28The%20other%20ending%29\.md/u,
    )
    expect(await response.text()).toContain('The ship came in.')
  })

  it('refuses a chapter that is not there, and one that is not a number', async () => {
    expect((await get(story.slug, 'format=md&chapter=3')).status).toBe(404)
    expect((await get(story.slug, 'format=md&chapter=0')).status).toBe(400)
    expect((await get(story.slug, 'format=md&chapter=two')).status).toBe(400)
    expect((await get(story.slug, 'format=md&version=no-such-version')).status).toBe(404)
  })

  it('carries a title in another script whole, and falls back to "story" for the plain name', async () => {
    const response = await get(hindiSlug, 'format=docx')
    const header = response.headers.get('content-disposition') ?? ''
    expect(header).toMatch(/filename="story-\d{4}-\d{2}-\d{2}\.docx"/u)
    const real = decodeURIComponent(header.split("filename*=UTF-8''")[1] ?? '')
    expect(real).toMatch(/^दिल्ली की रातें \d{4}-\d{2}-\d{2}\.docx$/u)
  })

  it('dates the file where the writer is (item 1.18)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-23T20:00:00Z'))
    const utc = await get(story.slug, 'format=md')
    expect(utc.headers.get('content-disposition')).toContain('-2026-10-23.md"')
    const kolkata = await get(story.slug, 'format=md', 'tz=Asia%2FKolkata')
    expect(kolkata.headers.get('content-disposition')).toContain('-2026-10-24.md"')
  })
})
