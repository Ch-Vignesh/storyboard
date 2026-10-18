/**
 * Phase 14, item 3.14 — "Download your data". What the zip holds, whose it
 * is, and how often. Needs a real Postgres, so it skips when DATABASE_URL is
 * unset. CI runs it.
 */
import { randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { unzipFiles } from '@storyboard/export'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

type Session = {
  user: { id: string; username: string | null; onboarded: boolean }
  expires: string
}

const state = vi.hoisted(() => ({ session: null as Session | null }))
vi.mock('@/auth', () => ({ auth: async () => state.session }))

const databaseUrl = process.env.DATABASE_URL

describe.skipIf(!databaseUrl)('GET /api/export/account', () => {
  let db: PrismaClient
  const people: string[] = []
  const stories: string[] = []

  async function person(label: string) {
    const run = randomUUID().replaceAll('-', '').slice(0, 8)
    const row = await db.user.create({
      data: {
        email: `ex-${label}-${run}@example.test`,
        username: `ex-${label}-${run}`,
        displayName: `Ex ${label}`,
        emailVerifiedAt: new Date(),
        onboardedAt: new Date(),
      },
      select: { id: true, username: true, email: true },
    })
    people.push(row.id)
    return row
  }

  /** A story with one written section. Returns what the other rows hang off. */
  async function aStory(ownerId: string, title: string, visibility: 'PUBLIC' | 'PRIVATE') {
    const run = randomUUID().replaceAll('-', '').slice(0, 8)
    const storyboard = await db.storyboard.create({
      data: { publicId: `ex${run}`, slug: `ex-${run}`, title, type: 'NOVEL', visibility, ownerId },
      select: { id: true, slug: true },
    })
    stories.push(storyboard.id)
    const version = await db.version.create({
      data: { storyboardId: storyboard.id, name: 'Main draft', isMain: true, createdById: ownerId },
      select: { id: true },
    })
    const chapter = await db.chapter.create({
      data: { versionId: version.id, lineageId: randomUUID(), order: 0, title: 'One' },
      select: { id: true },
    })
    const section = await db.section.create({
      data: { chapterId: chapter.id, lineageId: randomUUID(), order: 0, wordCount: 8 },
      select: { id: true },
    })
    const sentence = 'The harbour had been empty for a year.'
    const revision = await db.revision.create({
      data: {
        sectionId: section.id,
        contentJson: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: sentence }] }],
        },
        contentText: sentence,
        wordCount: 8,
        contentHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
        source: 'AUTHORED',
        authorId: ownerId,
      },
      select: { id: true },
    })
    await db.section.update({
      where: { id: section.id },
      data: { currentRevisionId: revision.id },
    })
    return { ...storyboard, sectionId: section.id, sentence }
  }

  function signedInAs(who: { id: string; username: string | null } | null) {
    state.session = who
      ? { user: { id: who.id, username: who.username, onboarded: true }, expires: '' }
      : null
  }

  async function download() {
    const { GET } = await import('./route')
    return GET()
  }

  function textOf(files: Record<string, Uint8Array>, name: string): string {
    const bytes = files[name]
    if (!bytes) throw new Error(`${name} is not in the zip`)
    return Buffer.from(bytes).toString('utf8')
  }

  beforeAll(() => {
    db = createPrismaClient({ log: [] })
  })

  afterAll(async () => {
    // A revision cannot be deleted (NFR-3's trigger), so neither can the
    // story around it nor the person who owns it. What can go, goes; the
    // stories stay, as the purge tests' do, in a database that is thrown away.
    await db.report.deleteMany({ where: { reporterId: { in: people } } })
    await db.userBlock.deleteMany({ where: { blockerId: { in: people } } })
    await db.$disconnect()
  })

  it('refuses a stranger', async () => {
    signedInAs(null)
    expect((await download()).status).toBe(401)
  })

  it('zips what is yours, names a story only where you can still read it, and allows one a day', async () => {
    const me = await person('me')
    const other = await person('other')
    const mine = await aStory(me.id, 'The Weir in Spring', 'PUBLIC')
    const theirs = await aStory(other.id, 'A Private Draft', 'PRIVATE')
    const request = await db.contributionRequest.create({
      data: {
        publicId: `rq${randomUUID().replaceAll('-', '').slice(0, 10)}`,
        storyboardId: theirs.id,
        sectionId: theirs.sectionId,
        kind: 'UNBLOCK',
        title: 'Help me think about the ship',
        ask: 'The ship is logged every morning and never arrives; what is she protecting?',
        openedById: other.id,
      },
      select: { id: true },
    })
    await db.idea.create({
      data: { requestId: request.id, authorId: me.id, body: 'What if the ship never existed?' },
    })
    await db.credit.createMany({
      data: [
        { storyboardId: theirs.id, contributorId: me.id, type: 'IDEA' },
        { storyboardId: mine.id, contributorId: me.id, type: 'PROSE' },
      ],
    })
    await db.report.create({
      data: {
        reporterId: me.id,
        targetType: 'STORYBOARD',
        targetId: theirs.id,
        category: 'SPAM',
        note: 'Looks copied.',
      },
    })
    await db.userBlock.create({ data: { blockerId: me.id, blockedId: other.id } })

    signedInAs(me)
    const response = await download()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/zip')
    expect(response.headers.get('content-disposition')).toContain(`draftboard-${me.username}-`)

    const files = unzipFiles(new Uint8Array(await response.arrayBuffer()))
    expect(Object.keys(files).sort()).toEqual([
      'account.json',
      'credits.json',
      'ideas.json',
      'reports-made.json',
      'stories/the-weir-in-spring.md',
      'suggestions.json',
    ])

    const account = JSON.parse(textOf(files, 'account.json')) as {
      profile: { email: string; username: string }
      blocked: Array<{ username: string }>
    }
    expect(account.profile.email).toBe(me.email)
    expect(account.profile.username).toBe(me.username)
    expect(account.blocked.map((block) => block.username)).toEqual([other.username])

    expect(textOf(files, 'stories/the-weir-in-spring.md')).toContain(mine.sentence)

    // Their story is private: your words, not its name, and not the request's.
    const ideas = JSON.parse(textOf(files, 'ideas.json')) as Array<{
      text: string
      story: unknown
      request: unknown
    }>
    expect(ideas).toEqual([
      expect.objectContaining({
        text: 'What if the ship never existed?',
        story: null,
        request: null,
      }),
    ])
    const credits = JSON.parse(textOf(files, 'credits.json')) as Array<{
      type: string
      story: { title: string } | null
    }>
    expect(credits).toEqual([
      expect.objectContaining({ type: 'IDEA', story: null }),
      expect.objectContaining({
        type: 'PROSE',
        story: { title: 'The Weir in Spring', slug: mine.slug },
      }),
    ])
    expect(JSON.parse(textOf(files, 'reports-made.json'))).toEqual([
      expect.objectContaining({ about: 'STORYBOARD', category: 'SPAM', note: 'Looks copied.' }),
    ])
    expect(JSON.parse(textOf(files, 'suggestions.json'))).toEqual([])

    // One a day: the limit is taken after the checks (decision 0037), so the
    // second ask is refused and costs nothing.
    const again = await download()
    expect(again.status).toBe(429)
    expect(((await again.json()) as { error: string }).error).toMatch(/recently/u)
  })
})
