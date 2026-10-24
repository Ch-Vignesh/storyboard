/**
 * Phase 14, item 8.12 (FR-13.6, D-11) — the PDF of a version's record. Issued
 * to the writer the record names, while they may read that version, never
 * for a restore, and printing the public record's address rather than a
 * history page a stranger cannot open. Needs a real Postgres, so it skips
 * when DATABASE_URL is unset. CI runs it.
 */
import { randomUUID } from 'node:crypto'
import { inflateSync } from 'node:zlib'

import { createPrismaClient, type PrismaClient } from '@storyboard/db'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

type Session = {
  user: { id: string; username: string | null; onboarded: boolean }
  expires: string
}

const state = vi.hoisted(() => ({ session: null as Session | null }))
vi.mock('@/auth', () => ({ auth: async () => state.session }))

const databaseUrl = process.env.DATABASE_URL

/** The lines a PDFKit page prints: hex `TJ` arrays inside a deflated stream. */
function printedLines(pdf: Buffer): string[] {
  const lines: string[] = []
  for (const [, stream] of pdf
    .toString('latin1')
    .matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/gu)) {
    const content = inflateSync(Buffer.from(stream ?? '', 'latin1')).toString('latin1')
    for (const [, array] of content.matchAll(/\[(.*?)\] TJ/gu)) {
      const hex = [...(array ?? '').matchAll(/<([0-9a-f]*)>/giu)].map((part) => part[1]).join('')
      lines.push(Buffer.from(hex, 'hex').toString('latin1'))
    }
  }
  return lines
}

describe.skipIf(!databaseUrl)('GET /api/export/proof/[revision] (item 8.12)', () => {
  let db: PrismaClient
  const people: string[] = []
  const stories: string[] = []
  const run = randomUUID().replaceAll('-', '').slice(0, 8)
  let owner = { id: '', username: '' }
  let writer = { id: '', username: '' }
  const ids = { accepted: '', restored: '', former: '' }

  async function person(label: string) {
    const username = `pr-${label}-${run}`
    const row = await db.user.create({
      data: {
        email: `${username}@example.test`,
        username,
        displayName: `Pr ${label}`,
        emailVerifiedAt: new Date(),
        onboardedAt: new Date(),
      },
      select: { id: true },
    })
    people.push(row.id)
    return { id: row.id, username }
  }

  async function sectionIn(visibility: 'PUBLIC' | 'PRIVATE') {
    const tag = randomUUID().replaceAll('-', '').slice(0, 8)
    const storyboard = await db.storyboard.create({
      data: {
        publicId: `pr${tag}`,
        slug: `proof-route-${tag}`,
        title: `Story ${tag}`,
        type: 'NOVEL',
        visibility,
        publicFrom: visibility === 'PUBLIC' ? new Date(Date.now() - 60_000) : null,
        ownerId: owner.id,
      },
      select: { id: true },
    })
    stories.push(storyboard.id)
    const version = await db.version.create({
      data: {
        storyboardId: storyboard.id,
        name: 'Main draft',
        isMain: true,
        createdById: owner.id,
      },
      select: { id: true },
    })
    const chapter = await db.chapter.create({
      data: { versionId: version.id, lineageId: randomUUID(), order: 0, title: 'One' },
      select: { id: true },
    })
    const section = await db.section.create({
      data: { chapterId: chapter.id, lineageId: randomUUID(), order: 0, title: 'The harbour' },
      select: { id: true },
    })
    return section.id
  }

  async function revision(sectionId: string, data: Record<string, unknown>) {
    const row = await db.revision.create({
      data: {
        sectionId,
        contentJson: { type: 'doc', content: [] },
        contentText: 'The harbour had been empty for a year.',
        wordCount: 8,
        contentHash: 'b'.repeat(64),
        source: 'AUTHORED',
        authorId: owner.id,
        ...data,
      },
      select: { id: true },
    })
    return row.id
  }

  const signIn = (who: { id: string; username: string } | null) => {
    state.session = who
      ? { user: { id: who.id, username: who.username, onboarded: true }, expires: '' }
      : null
  }

  async function get(revisionId: string) {
    const { GET } = await import('./route')
    return GET(new Request(`http://localhost/api/export/proof/${revisionId}`), {
      params: Promise.resolve({ revision: revisionId }),
    })
  }

  beforeAll(async () => {
    db = createPrismaClient({ log: [] })
    owner = await person('owner')
    writer = await person('writer')
    const open = await sectionIn('PUBLIC')
    ids.accepted = await revision(open, {
      source: 'ACCEPTED',
      authorId: writer.id,
      acceptedById: owner.id,
    })
    ids.restored = await revision(open, { source: 'RESTORED', restoredFromId: ids.accepted })
    // Written by somebody who could read the story then and cannot now: a
    // co-author since removed, on a story that is private.
    ids.former = await revision(await sectionIn('PRIVATE'), { authorId: writer.id })
  })

  afterAll(async () => {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`select set_config('storyboard.hard_delete', 'on', true)`)
      const where = { chapter: { version: { storyboardId: { in: stories } } } }
      await tx.section.updateMany({ where, data: { currentRevisionId: null } })
      await tx.revision.deleteMany({ where: { section: where, restoredFromId: { not: null } } })
      await tx.revision.deleteMany({ where: { section: where } })
      await tx.section.deleteMany({ where })
      await tx.chapter.deleteMany({ where: { version: { storyboardId: { in: stories } } } })
      await tx.version.deleteMany({ where: { storyboardId: { in: stories } } })
      await tx.storyboard.deleteMany({ where: { id: { in: stories } } })
      await tx.user.deleteMany({ where: { id: { in: people } } })
    })
    await db.$disconnect()
  })

  it('asks a signed-out visitor to sign in', async () => {
    signIn(null)
    expect((await get(ids.accepted)).status).toBe(401)
  })

  it('issues the writer a PDF that prints the public record’s address', async () => {
    signIn(writer)
    const response = await get(ids.accepted)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')

    const lines = printedLines(Buffer.from(await response.arrayBuffer()))
    const label = lines.indexOf('CHECK IT AT')
    expect(lines[label + 1]).toBe(`${process.env.NEXT_PUBLIC_APP_URL ?? ''}/proof/${ids.accepted}`)
    expect(lines).toContain('Pr writer')
  })

  it('issues nobody else one, and nobody one for a restore', async () => {
    signIn(owner)
    // The owner accepted it; the words are the writer's.
    expect((await get(ids.accepted)).status).toBe(404)
    // The owner restored this; its words are the writer's too. Offered until item 8.12.
    expect((await get(ids.restored)).status).toBe(404)
  })

  it('refuses a writer who can no longer read the version', async () => {
    signIn(writer)
    expect((await get(ids.former)).status).toBe(404)
  })
})
