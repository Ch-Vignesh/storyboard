import { randomUUID } from 'node:crypto'

import type { PrismaClient } from '../../../src/generated/prisma/client'

import type { SeedAccounts } from './accounts'
import type { SeedRequest } from './library'
import { deriveOf, docOf, paragraphsOf } from './prose'

/**
 * The seeded stuck points, and the help already offered on some of them
 * (FR-15.1, FR-15.4; D-14, phase 14 item 9.5).
 *
 * **Idempotent by title, and additive.** A request is found by its title on
 * its story, and made only if it is missing. That is what lets a stuck point
 * written into the library after a database was seeded reach that database —
 * production was seeded in October 2026 with no rewrite left open and nothing
 * on The Yellow Wallpaper — without a second run making anything twice. A
 * request that exists is never changed: by then people may be answering it.
 * Changing a title in the library therefore makes a new request on a seeded
 * database; the old one stays, as anything a seed has published does.
 *
 * **Seeded help** is written by the example helpers (FR-15.3) and is only
 * ever rows hanging off a seeded request: a suggestion sent and waiting, or a
 * top-level idea. No notification, no calendar day, no credit — nothing that
 * would outlive the story — so when a seeded story is removed for good (the
 * purge, FR-2.6), its help goes with it. One suggestion and one idea per
 * helper per request, which is also how a second run knows it is done.
 */

export type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

/** A story's section ids, by chapter and position, as the library addresses them. */
export type SectionGrid = ReadonlyArray<readonly string[]>

export type RequestsAdded = {
  /** Requests made on this run. */
  requests: number
  /** Of those, the ones made already answered, with an accepted suggestion (FR-15.4). */
  answered: number
  /** Suggestions and ideas from the example helpers, made on this run. */
  help: number
  /** Titles the seed could not place, because their section is already asked about. */
  unplaced: string[]
}

type RequestRow = { id: string; title: string; state: string; sectionId: string }

const isOpen = (state: string) => state === 'OPEN' || state === 'ANSWERED'

const newPublicId = () => randomUUID().replaceAll('-', '').slice(0, 10)

function helperId(accounts: SeedAccounts, username: string): string {
  const id = accounts.helpers.get(username)
  // The library names a helper the seed does not make. A bug in the library,
  // and better found here than as a request with nobody behind its answer.
  if (!id) throw new Error(`The seed library names an unknown helper: ${username}`)
  return id
}

export async function ensureRequests(
  tx: Tx,
  input: {
    storyboardId: string
    accounts: SeedAccounts
    requests: readonly SeedRequest[]
    sections: SectionGrid
  },
): Promise<RequestsAdded> {
  const present: RequestRow[] = await tx.contributionRequest.findMany({
    where: { storyboardId: input.storyboardId },
    select: { id: true, title: true, state: true, sectionId: true },
  })
  const byTitle = new Map(present.map((row) => [row.title, row]))

  // FR-5.1, enforced by `one_open_request_per_section`: a section may have
  // only one request in OPEN or ANSWERED at a time. A resolved one does not
  // count, so an answered request can share a section with an open one.
  const asked = new Set(present.filter((row) => isOpen(row.state)).map((row) => row.sectionId))

  const added: RequestsAdded = { requests: 0, answered: 0, help: 0, unplaced: [] }

  for (const request of input.requests) {
    let row = byTitle.get(request.title)

    if (!row) {
      const sectionId = input.sections[request.chapter ?? 0]?.[request.section]
      // Never moved to another section: an ask is written about one passage,
      // and on any other it would be asking about text that is not there.
      // The library's own test keeps this from happening on a fresh database.
      if (!sectionId || (!request.accepted && asked.has(sectionId))) {
        added.unplaced.push(request.title)
        continue
      }

      row = await createRequest(tx, {
        request,
        sectionId,
        storyboardId: input.storyboardId,
        accounts: input.accounts,
      })
      byTitle.set(row.title, row)
      if (isOpen(row.state)) asked.add(sectionId)
      added.requests += 1
      if (request.accepted) added.answered += 1
    }

    added.help += await ensureHelp(tx, row, request, input.accounts)
  }

  return added
}

async function createRequest(
  tx: Tx,
  input: { request: SeedRequest; storyboardId: string; sectionId: string; accounts: SeedAccounts },
): Promise<RequestRow> {
  const { request, accounts } = input

  const row = await tx.contributionRequest.create({
    data: {
      publicId: newPublicId(),
      storyboardId: input.storyboardId,
      sectionId: input.sectionId,
      openedById: accounts.platformId,
      kind: request.kind,
      title: request.title,
      ask: request.ask,
      preContext: request.preContext ?? null,
      state: request.accepted ? 'RESOLVED' : 'OPEN',
    },
    select: { id: true, title: true, state: true, sectionId: true },
  })

  if (!request.accepted) return row

  // FR-15.4 wants answered requests visible so a visitor can see the loop
  // close: the suggestion, the acceptance, and the credit that followed.
  const contributorId = helperId(accounts, request.accepted.by)
  const section = await tx.section.findUniqueOrThrow({
    where: { id: input.sectionId },
    select: { lineageId: true, currentRevisionId: true },
  })
  if (!section.currentRevisionId) throw new Error(`Section ${input.sectionId} has no text yet`)

  const paragraphs = paragraphsOf(request.accepted.prose)
  const derived = deriveOf(paragraphs)
  const suggestion = await tx.suggestion.create({
    data: {
      publicId: newPublicId(),
      requestId: row.id,
      contributorId,
      baseRevisionId: section.currentRevisionId,
      contentJson: docOf(paragraphs),
      // A suggestion carries no hash: it is not yet a revision, and nothing
      // depends on proving when it was written until it is accepted.
      contentText: derived.contentText,
      wordCount: derived.wordCount,
      note: request.accepted.note,
      state: 'ACCEPTED',
      submittedAt: new Date(),
      decidedAt: new Date(),
      decidedById: accounts.platformId,
    },
    select: { id: true },
  })

  // FR-8.1 — accepting writes a revision attributed to both halves.
  const revision = await tx.revision.create({
    data: {
      sectionId: input.sectionId,
      parentId: section.currentRevisionId,
      contentJson: docOf(paragraphs),
      ...derived,
      source: 'ACCEPTED',
      authorId: contributorId,
      acceptedById: accounts.platformId,
      suggestionId: suggestion.id,
    },
    select: { id: true },
  })

  await tx.section.update({
    where: { id: input.sectionId },
    data: { currentRevisionId: revision.id, wordCount: derived.wordCount },
  })

  // FR-9.1 — the credit, which is the point of the whole loop.
  await tx.credit.create({
    data: {
      storyboardId: input.storyboardId,
      contributorId,
      type: 'PROSE',
      sectionLineage: section.lineageId,
      revisionId: revision.id,
      suggestionId: suggestion.id,
      isLive: true,
    },
  })

  return row
}

/**
 * D-14 — the help the library gives a request, made where it is missing.
 * Prose answers a rewrite or a continuation and ideas answer a request for
 * them, as the application insists (FR-5.2, item 1.8). A request no longer
 * taking answers — closed by the nightly close since it was seeded (decision
 * 0050), say — is left as it is.
 */
async function ensureHelp(
  tx: Tx,
  row: RequestRow,
  request: SeedRequest,
  accounts: SeedAccounts,
): Promise<number> {
  const suggestions = request.kind === 'UNBLOCK' ? [] : (request.suggestions ?? [])
  const ideas = request.kind === 'UNBLOCK' ? (request.ideas ?? []) : []
  if (suggestions.length + ideas.length === 0 || !isOpen(row.state)) return 0

  let added = 0

  for (const suggestion of suggestions) {
    const contributorId = helperId(accounts, suggestion.by)
    const sent = await tx.suggestion.findFirst({
      where: { requestId: row.id, contributorId },
      select: { id: true },
    })
    if (sent) continue

    const section = await tx.section.findUniqueOrThrow({
      where: { id: row.sectionId },
      select: { currentRevisionId: true },
    })
    if (!section.currentRevisionId) continue

    const paragraphs = paragraphsOf(suggestion.prose)
    const derived = deriveOf(paragraphs)
    await tx.suggestion.create({
      data: {
        publicId: newPublicId(),
        requestId: row.id,
        contributorId,
        // FR-6.3 — written against the section as it stands.
        baseRevisionId: section.currentRevisionId,
        contentJson: docOf(paragraphs),
        contentText: derived.contentText,
        wordCount: derived.wordCount,
        note: suggestion.note,
        state: 'SUBMITTED',
        // After the story became public, which it was from the start: decision
        // 0007 keeps anything sent before `publicFrom` from strangers.
        submittedAt: new Date(),
      },
    })
    added += 1
  }

  for (const idea of ideas) {
    const authorId = helperId(accounts, idea.by)
    const posted = await tx.idea.findFirst({
      where: { requestId: row.id, authorId, parentId: null },
      select: { id: true },
    })
    if (posted) continue

    await tx.idea.create({ data: { requestId: row.id, authorId, body: idea.body } })
    added += 1
  }

  // FR-5.9, and item 1.12 for ideas: the first answer from outside the story
  // moves an open request to answered, as it would have had a person sent it.
  if (added > 0 && row.state === 'OPEN') {
    await tx.contributionRequest.update({ where: { id: row.id }, data: { state: 'ANSWERED' } })
    row.state = 'ANSWERED'
  }

  return added
}
