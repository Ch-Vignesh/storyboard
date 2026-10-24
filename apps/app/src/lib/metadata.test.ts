/**
 * Phase 14, item 9.6 — what a page says about itself, and to whom.
 *
 * The rule under test is the one that matters: metadata never carries a
 * private or hidden story's title or text to someone who may not read it. It
 * is built through the same procedures the pages read with, as the person
 * asking, so each case here hands `lib/metadata` a caller for a particular
 * person (`createTRPCContext`, session mocked) and looks at what comes back.
 *
 * The database half needs a real Postgres and skips without DATABASE_URL. CI
 * runs it.
 */
import { createHash, randomUUID } from 'node:crypto'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { TRPCError } from '@trpc/server'
import type { Metadata } from 'next'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { PREVIEW_DESCRIPTION_CHARS } from '@/lib/schemas/constants'

import {
  contributorsMetadata,
  excerpt,
  orNotFound,
  requestMetadata,
  storyMetadata,
  suggestionMetadata,
} from './metadata'

let signedIn: { id: string; username: string } | null = null

vi.mock('@/auth', () => ({
  auth: async () =>
    signedIn
      ? { user: { id: signedIn.id, username: signedIn.username, onboarded: true }, expires: '' }
      : null,
}))

describe('excerpt', () => {
  it('leaves a short text as it is, with its whitespace folded', () => {
    expect(excerpt('  The lamp\n\nturned   twice.  ')).toBe('The lamp turned twice.')
  })

  it('cuts a long text at a word, within the limit, and says it was cut', () => {
    const text = 'She counted the lamp turns until they stopped agreeing with the clock. '.repeat(6)
    const cut = excerpt(text)
    expect(cut.length).toBeLessThanOrEqual(PREVIEW_DESCRIPTION_CHARS)
    expect(cut.endsWith('…')).toBe(true)
    expect(text.startsWith(cut.slice(0, -1))).toBe(true)
    // At a word: what comes before the ellipsis is a whole word of the text.
    expect(text.charAt(cut.length - 1)).toMatch(/[\s.]/u)
  })

  it('still cuts one enormous word rather than saying nothing', () => {
    expect(excerpt('x'.repeat(500))).toBe(`${'x'.repeat(PREVIEW_DESCRIPTION_CHARS - 1)}…`)
  })
})

describe('orNotFound', () => {
  it('answers a story this person may not read with the 404 the page gives', async () => {
    const refused = Promise.reject(new TRPCError({ code: 'NOT_FOUND', message: 'No.' }))
    await expect(orNotFound(refused)).rejects.toMatchObject({
      digest: expect.stringContaining('404') as unknown,
    })
  })

  it('lets any other failure through as itself', async () => {
    const broken = Promise.reject(new Error('the database is down'))
    await expect(orNotFound(broken)).rejects.toThrow('the database is down')
  })
})

const databaseUrl = process.env.DATABASE_URL

/** Prose, as the editor stores it. */
function doc(text: string) {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }
}

const OPENING =
  'Ruth kept the harbour log the way other people keep a diary, which is to say badly and in secret, and on the morning the ship did not arrive she wrote it down as arriving anyway.'
const SECOND_SECTION = 'The second section begins somewhere else entirely, on a train.'
const PRIVATE_TEXT = 'Nobody but its author has read this sentence.'
const PRIVATE_LOGLINE = 'A secret the author has told nobody yet.'
const HIDDEN_TEXT = 'Words that a moderator has taken out of view.'
const ASK =
  'The section under this request turns on a decision the narrator makes without admitting it, and at the moment it reads like minutes of a meeting.'

describe.skipIf(!databaseUrl)('metadata, as each person may see it (item 9.6)', () => {
  let db: PrismaClient
  const run = randomUUID().replaceAll('-', '').slice(0, 8)
  const people: string[] = []
  const stories: string[] = []
  let owner = { id: '', username: '' }
  let helper = { id: '', username: '' }
  let stranger = { id: '', username: '' }
  let moderator = { id: '', username: '' }

  let open = { slug: '', id: '', title: '', alternateId: '' }
  let withLogline = { slug: '', title: '', logline: '' }
  let secret = { slug: '', title: '', requestPublicId: '' }
  let hidden = { slug: '', title: '' }
  let requestPublicId = ''
  let suggestionPublicId = ''

  async function person(label: string, role: 'USER' | 'SUB_ADMIN' = 'USER') {
    const username = `md-${label}-${run}`
    const row = await db.user.create({
      data: { email: `${username}@example.test`, username, emailVerifiedAt: new Date(), role },
      select: { id: true },
    })
    people.push(row.id)
    return { id: row.id, username }
  }

  async function as(who: { id: string; username: string } | null) {
    signedIn = who
    const { createCallerFactory, createTRPCContext } = await import('@/server/trpc/init')
    const { appRouter } = await import('@/server/trpc/routers/_app')
    return createCallerFactory(appRouter)(await createTRPCContext({ headers: new Headers() }))
  }

  /** A section with this text, or empty, as its current revision. */
  async function section(chapterId: string, order: number, text: string | null) {
    const words = text ? text.split(/\s+/u).length : 0
    const row = await db.section.create({
      data: { chapterId, lineageId: randomUUID(), order, wordCount: words },
      select: { id: true },
    })
    const revision = await db.revision.create({
      data: {
        sectionId: row.id,
        contentJson: text ? doc(text) : { type: 'doc', content: [{ type: 'paragraph' }] },
        contentText: text ?? '',
        wordCount: words,
        contentHash: createHash('sha256')
          .update(`${run}${row.id}${text ?? ''}`)
          .digest('hex'),
        source: 'AUTHORED',
        authorId: owner.id,
      },
      select: { id: true },
    })
    await db.section.update({ where: { id: row.id }, data: { currentRevisionId: revision.id } })
    return { id: row.id, revisionId: revision.id }
  }

  /** A story with one chapter of the given sections, in a version of its own. */
  async function story(
    label: string,
    options: {
      visibility: 'PUBLIC' | 'PRIVATE'
      logline?: string
      hidden?: boolean
      sections: Array<string | null>
    },
  ) {
    const title = `The ${label} story ${run}`
    const slug = `md-${label}-${run}`
    const row = await db.storyboard.create({
      data: {
        publicId: `md${label.slice(0, 3)}${run}`,
        slug,
        title,
        logline: options.logline ?? null,
        type: 'NOVEL',
        visibility: options.visibility,
        publicFrom: options.visibility === 'PUBLIC' ? new Date(Date.now() - 60_000) : null,
        hiddenAt: options.hidden ? new Date() : null,
        hiddenReason: options.hidden ? 'SPAM' : null,
        ownerId: owner.id,
      },
      select: { id: true },
    })
    stories.push(row.id)
    const version = await db.version.create({
      data: { storyboardId: row.id, name: 'Main draft', isMain: true, createdById: owner.id },
      select: { id: true },
    })
    const chapter = await db.chapter.create({
      data: { versionId: version.id, lineageId: randomUUID(), order: 0, title: 'The log' },
      select: { id: true },
    })
    const sections = []
    for (const [order, text] of options.sections.entries()) {
      sections.push(await section(chapter.id, order, text))
    }
    return { id: row.id, slug, title, sections }
  }

  beforeAll(async () => {
    db = createPrismaClient({ log: [] })
    owner = await person('owner')
    helper = await person('helper')
    stranger = await person('stranger')
    moderator = await person('mod', 'SUB_ADMIN')
    await db.subAdminGrant.create({
      data: { userId: moderator.id, capability: 'reports.decide', grantedById: owner.id },
    })

    // Public, no logline: an empty first section, then the opening, then more.
    const made = await story('open', {
      visibility: 'PUBLIC',
      sections: [null, OPENING, SECOND_SECTION],
    })
    const alternate = await db.version.create({
      data: { storyboardId: made.id, name: 'What if', isMain: false, createdById: owner.id },
      select: { id: true },
    })
    open = { slug: made.slug, id: made.id, title: made.title, alternateId: alternate.id }

    const described = await story('described', {
      visibility: 'PUBLIC',
      logline: 'A harbourmaster logs a ship that never comes.',
      sections: [OPENING],
    })
    withLogline = {
      slug: described.slug,
      title: described.title,
      logline: 'A harbourmaster logs a ship that never comes.',
    }

    const kept = await story('secret', {
      visibility: 'PRIVATE',
      logline: PRIVATE_LOGLINE,
      sections: [PRIVATE_TEXT],
    })
    const privateRequest = await db.contributionRequest.create({
      data: {
        publicId: `mdq${run}`,
        storyboardId: kept.id,
        sectionId: kept.sections[0]!.id,
        openedById: owner.id,
        kind: 'UNBLOCK',
        title: 'A private stuck point',
        ask: ASK,
      },
      select: { publicId: true },
    })
    secret = { slug: kept.slug, title: kept.title, requestPublicId: privateRequest.publicId }

    const taken = await story('hidden', {
      visibility: 'PUBLIC',
      hidden: true,
      sections: [HIDDEN_TEXT],
    })
    hidden = { slug: taken.slug, title: taken.title }

    requestPublicId = `mdr${run}`
    const request = await db.contributionRequest.create({
      data: {
        publicId: requestPublicId,
        storyboardId: made.id,
        sectionId: made.sections[1]!.id,
        openedById: owner.id,
        kind: 'REWRITE',
        title: 'The ship that never comes',
        ask: ASK,
      },
      select: { id: true },
    })
    suggestionPublicId = `mds${run}`
    await db.suggestion.create({
      data: {
        publicId: suggestionPublicId,
        requestId: request.id,
        contributorId: helper.id,
        baseRevisionId: made.sections[1]!.revisionId,
        contentJson: doc('A different morning altogether.'),
        contentText: 'A different morning altogether.',
        wordCount: 4,
        state: 'SUBMITTED',
        submittedAt: new Date(),
      },
    })
  })

  afterAll(async () => {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`select set_config('storyboard.hard_delete', 'on', true)`)
      const inStories = { storyboardId: { in: stories } }
      await tx.suggestion.deleteMany({ where: { request: inStories } })
      await tx.contributionRequest.deleteMany({ where: inStories })
      const sections = { chapter: { version: inStories } }
      await tx.section.updateMany({ where: sections, data: { currentRevisionId: null } })
      await tx.revision.deleteMany({ where: { section: sections } })
      await tx.section.deleteMany({ where: sections })
      await tx.chapter.deleteMany({ where: { version: inStories } })
      await tx.version.deleteMany({ where: inStories })
      await tx.storyboard.deleteMany({ where: { id: { in: stories } } })
      await tx.notification.deleteMany({ where: { userId: { in: people } } })
      await tx.subAdminGrant.deleteMany({ where: { userId: { in: people } } })
      await tx.user.deleteMany({ where: { id: { in: people } } })
    })
    await db.$disconnect()
  })

  /** Everything a preview could carry, as one string to search. */
  const said = (metadata: Metadata) => JSON.stringify(metadata)

  it('describes a public story by its opening, and names its one address', async () => {
    const metadata = await storyMetadata(await as(null), { slug: open.slug })
    expect(metadata.title).toBe(open.title)
    // The first section with words in it: the empty one before it is passed over.
    expect(metadata.description).toBe(excerpt(OPENING))
    expect(metadata.alternates).toEqual({ canonical: `/s/${open.slug}` })
    expect(metadata.robots).toBeUndefined()
  })

  it('prefers the logline the author wrote, at the story’s own address', async () => {
    const metadata = await storyMetadata(await as(stranger), { slug: withLogline.slug })
    expect(metadata.description).toBe(withLogline.logline)
  })

  it('names a chapter, describes the passage at a section’s address, and points both at the chapter', async () => {
    const guest = await as(null)
    const chapter = await storyMetadata(guest, { slug: open.slug, chapter: '1' })
    expect(chapter.title).toBe(`The log — ${open.title}`)
    expect(chapter.description).toBe(excerpt(OPENING))
    expect(chapter.alternates).toEqual({ canonical: `/s/${open.slug}/c/1` })

    const third = await storyMetadata(guest, { slug: open.slug, chapter: '1', section: '3' })
    expect(third.description).toBe(SECOND_SECTION)
    expect(third.alternates).toEqual({ canonical: `/s/${open.slug}/c/1` })
  })

  it('keeps an alternate version out of the index, with no canonical of its own', async () => {
    const metadata = await storyMetadata(await as(null), {
      slug: open.slug,
      versionId: open.alternateId,
    })
    expect(metadata.robots).toEqual({ index: false })
    expect(metadata.alternates).toBeUndefined()
  })

  it('is a 404, with nothing of it said, to anyone who may not read a private story', async () => {
    for (const who of [null, stranger, helper, moderator]) {
      const refused = storyMetadata(await as(who), { slug: secret.slug })
      await expect(refused).rejects.toMatchObject({ code: 'NOT_FOUND' })
      const error = await refused.catch((caught: unknown) => caught)
      expect(String(error)).not.toContain(secret.title)
      expect(String(error)).not.toContain(PRIVATE_LOGLINE)
      await expect(
        storyMetadata(await as(who), { slug: secret.slug, chapter: '1', section: '1' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      await expect(contributorsMetadata(await as(who), secret.slug)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
      await expect(requestMetadata(await as(who), secret.requestPublicId)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    }
  })

  it('gives its author the title in the tab, and no description and no index', async () => {
    const author = await as(owner)
    for (const metadata of [
      await storyMetadata(author, { slug: secret.slug }),
      await storyMetadata(author, { slug: secret.slug, chapter: '1', section: '1' }),
      await contributorsMetadata(author, secret.slug),
      await requestMetadata(author, secret.requestPublicId),
    ]) {
      expect(said(metadata)).toContain(secret.title)
      expect(metadata.description).toBeUndefined()
      expect(said(metadata)).not.toContain(PRIVATE_TEXT)
      expect(said(metadata)).not.toContain(PRIVATE_LOGLINE)
      expect(said(metadata)).not.toContain(ASK)
      expect(metadata.robots).toEqual({ index: false, follow: false })
      expect(metadata.alternates).toBeUndefined()
    }
  })

  it('is a 404 to strangers once a story is hidden, and undescribed to those who still see it', async () => {
    for (const who of [null, stranger]) {
      await expect(storyMetadata(await as(who), { slug: hidden.slug })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    }
    for (const who of [owner, moderator]) {
      const metadata = await storyMetadata(await as(who), { slug: hidden.slug })
      expect(metadata.title).toBe(hidden.title)
      expect(said(metadata)).not.toContain(HIDDEN_TEXT)
      expect(metadata.robots).toEqual({ index: false, follow: false })
    }
  })

  it('names a request for its story and describes it by its ask', async () => {
    const metadata = await requestMetadata(await as(null), requestPublicId)
    expect(metadata.title).toBe(`The ship that never comes — a stuck point in ${open.title}`)
    expect(metadata.description).toBe(excerpt(ASK))
    expect(metadata.alternates).toEqual({ canonical: `/s/${open.slug}/help/${requestPublicId}` })
  })

  it('names a suggestion for its writer and its story, and keeps it out of the index', async () => {
    const metadata = await suggestionMetadata(await as(stranger), suggestionPublicId)
    expect(metadata.title).toBe(`${helper.username}’s suggestion — ${open.title}`)
    expect(metadata.robots).toEqual({ index: false })
    // The words of the suggestion stay on the page.
    expect(said(metadata)).not.toContain('A different morning')
  })

  it('names the contributors page for its story', async () => {
    const metadata = await contributorsMetadata(await as(null), open.slug)
    expect(metadata.title).toBe(`Contributors to ${open.title}`)
    expect(metadata.alternates).toEqual({ canonical: `/s/${open.slug}/contributors` })
  })
})
