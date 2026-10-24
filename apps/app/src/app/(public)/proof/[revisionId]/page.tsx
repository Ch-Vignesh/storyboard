import { TRPCError } from '@trpc/server'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { CopyLink } from '@/components/copy-link'
import Link from '@/components/link'
import { readTimeZone } from '@/lib/dates'
import { hasProfile, nameOf, type Person } from '@/lib/people'
import { formatInZone } from '@/lib/time-zone'
import { caller } from '@/trpc/server'

type Params = { params: Promise<{ revisionId: string }> }

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Proof of authorship',
  description: 'The record Draftboard keeps of one saved version of a section.',
}

/**
 * The algorithm, by its name: FR-13.6 asks for it, and a copy can only be
 * checked by someone who knows which one to run.
 */
const ALGORITHM = 'SHA-256' // vocabulary-ok: a hash's name, not a version's

/** Who the record names, by how the version came to be (FR-8.3's sources). */
const WRITER_LABELS = {
  AUTHORED: 'Written by',
  ACCEPTED: 'Written by',
  IMPORTED: 'Brought in from a file by',
  RESTORED: 'Restored by',
} as const

/**
 * Phase 14, item 8.12 (FR-13.6, D-11) — a proof anyone can check.
 *
 * The record of one saved version: its fingerprint, when it was saved, how
 * many words it held and who wrote it, at an address its writer can give to
 * anyone. Not signed: it is checked against this page, which reads the row
 * the database refuses to change (NFR-3). The story is named only to someone
 * who may read that version (`canNameStoryOnRecord`); anyone else is told it
 * was a private story. Guests reach it: `/proof` is not behind the account
 * wall (`lib/protected-routes.ts`).
 */
export default async function ProofPage({ params }: Params) {
  const { revisionId } = await params

  let record
  try {
    record = await caller.proof.get({ revisionId })
  } catch (error) {
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound()
    throw error
  }
  const { revision, story, mayTakePdf } = record
  const timeZone = await readTimeZone()
  const savedAt = revision.createdAt.toISOString()

  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="font-manuscript text-[30px] leading-tight font-medium text-ink">
        Proof of authorship
      </h1>
      <p className="mt-3 max-w-measure text-[15px] leading-relaxed text-ink-soft">
        What Draftboard recorded when one version of a section was saved. Anyone with this
        page&rsquo;s address can read it. <CopyLink path={`/proof/${revision.id}`} />
      </p>

      <dl className="mt-8 divide-y divide-rule border-y border-rule">
        <Row label={WRITER_LABELS[revision.source]}>
          <PersonName person={revision.author} />
        </Row>
        {revision.source === 'ACCEPTED' && revision.acceptedBy ? (
          <Row label="Accepted into the story by">
            <PersonName person={revision.acceptedBy} />
          </Row>
        ) : null}
        <Row label="Saved">
          <time dateTime={savedAt}>{formatInZone(revision.createdAt, 'dateTime', timeZone)}</time>
          <span className="mt-0.5 block font-mono text-[12px] text-ink-faint">{savedAt}</span>
        </Row>
        <Row label="Words">
          <span className="tabular-nums">{revision.wordCount.toLocaleString('en-GB')}</span>
        </Row>
        <Row label="In">
          {story ? (
            <Link href={`/s/${story.slug}`} className="text-pencil hover:underline">
              {story.title}
            </Link>
          ) : (
            <span className="text-ink-soft italic">a private story</span>
          )}
        </Row>
        <Row label={`${ALGORITHM} of the text`}>
          <span className="font-mono text-[13px] break-all">{revision.contentHash}</span>
        </Row>
      </dl>

      {/* FR-8.4 — a restore copies words somebody wrote before; that record
          is theirs, and this one only says when they were brought back. */}
      {revision.source === 'RESTORED' && revision.restoredFrom ? (
        <p className="mt-6 max-w-measure text-[14px] leading-relaxed text-ink-soft">
          This version brought back the words of one saved on{' '}
          {formatInZone(revision.restoredFrom.createdAt, 'long', timeZone)}.{' '}
          <Link href={`/proof/${revision.restoredFrom.id}`} className="text-pencil hover:underline">
            The record of that version
          </Link>{' '}
          says who wrote them.
        </p>
      ) : null}

      <section className="mt-8 space-y-3 text-[14px] leading-relaxed text-ink-soft">
        {/* NFR-3 — the trigger that refuses every change to a saved version. */}
        <p className="max-w-measure">
          Versions can&rsquo;t be changed once written. The database refuses any change to a saved
          version, so this record reads now exactly as it did the moment the version was saved.
        </p>
        {/* D-11 — what the record is, and what it is not. */}
        <p className="max-w-measure text-ink">
          This record shows who wrote these words on Draftboard, and when. It cannot show that they
          were original to that person.
        </p>
        <p className="max-w-measure">
          To check a copy of the text against it, take the {ALGORITHM} of the section&rsquo;s plain
          text, with a blank line between paragraphs. If it matches the one above, the copy is the
          text that was saved then.
        </p>
      </section>

      {mayTakePdf ? (
        <p className="mt-8 text-[13.5px]">
          <a href={`/api/export/proof/${revision.id}`} className="text-pencil hover:underline">
            Download this record as a PDF
          </a>
          <span className="text-ink-faint"> — it prints this page&rsquo;s address.</span>
        </p>
      ) : null}
    </main>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-3 sm:grid sm:grid-cols-[13rem_1fr] sm:gap-4">
      <dt className="text-[12.5px] tracking-wide text-ink-faint">{label}</dt>
      <dd className="mt-0.5 min-w-0 text-[14.5px] text-ink sm:mt-0">{children}</dd>
    </div>
  )
}

/** A name, linked to its profile where there is one (decision 0013: an erased person has none). */
function PersonName({ person }: { person: Person }) {
  return hasProfile(person) ? (
    <Link href={`/@${person.username}`} className="text-pencil hover:underline">
      {nameOf(person)}
    </Link>
  ) : (
    <span className="text-ink-soft italic">{nameOf(person)}</span>
  )
}
