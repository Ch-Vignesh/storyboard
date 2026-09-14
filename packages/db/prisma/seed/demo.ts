/**
 * Demo data, for looking at the product.
 *
 * **This is not part of `pnpm db:seed`.** It is a separate entry point
 * (`pnpm db:seed:demo`) because it creates accounts with known passwords, and
 * a known password must never reach a real deployment by accident. The
 * production seed path — genres and the public-domain example — cannot call it.
 *
 * It fills every phase 2 screen with something real: open requests of all three
 * kinds, suggestions waiting, one accepted with its credit, one gone stale, one
 * passed, and a thread of ideas with one marked as having helped. One of the
 * waiting suggestions is a close copy-edit and one is a replacement, so the
 * comparison view demonstrates both of its modes (FR-7.2).
 */

import { createHash, randomUUID } from 'node:crypto'

import { hash } from '@node-rs/argon2'

import type { PrismaClient } from '../../src/generated/prisma/client'

/** The same parameters `apps/app/src/auth/password.ts` uses. */
const ARGON2 = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const

const PASSWORD = 'storyboard-demo-password'

const PEOPLE = [
  {
    username: 'maya',
    displayName: 'Maya Okonkwo',
    bio: 'Writing something slow and cold about a harbour.',
  },
  { username: 'leah', displayName: 'Leah Brandt', bio: 'Short stories, mostly about weather.' },
  { username: 'arjun', displayName: 'Arjun Rao', bio: 'Recovering screenwriter.' },
] as const

function para(text: string) {
  return { type: 'paragraph', content: [{ type: 'text', text }] }
}

function docOf(paragraphs: readonly string[]) {
  return { type: 'doc', content: paragraphs.map(para) }
}

function derive(paragraphs: readonly string[]) {
  const contentText = paragraphs.join('\n\n')
  let wordCount = 0
  for (const token of contentText.split(/\s+/)) {
    if (/[\p{L}\p{N}]/u.test(token)) wordCount += 1
  }
  return {
    contentText,
    wordCount,
    contentHash: createHash('sha256').update(contentText, 'utf8').digest('hex'),
  }
}

/** Padding so a section clears FR-5.7's 150-word floor for a rewrite. */
function filler(seed: string, sentences: number): string {
  const bank = [
    `The ${seed} had not changed in the weeks since she arrived, which she took as a kind of rebuke.`,
    'She wrote the date at the top of the page and then sat looking at it for a long time.',
    'Outside, the light moved across the floor the way it had the day before, and the day before that.',
    'Nobody came. That was the arrangement, and she had made it herself, and she was not going to complain about it now.',
    'She read what she had written, crossed out a line, and put it back.',
    'By the afternoon the tide was out and the boats were leaning where they always leaned.',
  ]
  return Array.from({ length: sentences }, (_, i) => bank[i % bank.length]!).join(' ')
}

const HARBOUR = {
  title: 'The ship never lands',
  logline: 'A harbourmaster keeps a logbook for a ship that has been arriving for eleven years.',
  chapters: [
    {
      title: 'The logbook',
      sections: [
        [
          'The ship had been arriving for eleven years and Ruth had written it down every morning of them.',
          filler('harbour', 6),
          'She did not believe in it any more, exactly. She believed in the writing down.',
          filler('logbook', 5),
        ],
        [
          'The harbourmaster before her had kept the same book and had not mentioned the ship once.',
          filler('office', 6),
          'There were pages missing near the front. She had never asked about them.',
          filler('pages', 5),
        ],
      ],
    },
    {
      title: 'The inspector',
      sections: [
        [
          'The man from the department arrived on a Tuesday and asked to see eleven years of entries.',
          filler('inspector', 6),
          'He read them in order, which nobody had ever done, including her.',
          filler('reading', 5),
        ],
        // Left thin on purpose: this is where the `continue` request points.
        ['He asked her what she expected to happen when it finally came in.'],
      ],
    },
  ],
} as const

export async function seedDemo(prisma: PrismaClient): Promise<string> {
  const existing = await prisma.storyboard.findUnique({
    where: { publicId: 'demoharbour' },
    select: { id: true },
  })
  if (existing) return 'already present'

  const passwordHash = await hash(PASSWORD, ARGON2)
  const now = new Date()
  const ago = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

  const users: Record<string, string> = {}
  for (const person of PEOPLE) {
    const user = await prisma.user.upsert({
      where: { email: `${person.username}@storyboard.invalid` },
      create: {
        email: `${person.username}@storyboard.invalid`,
        username: person.username,
        displayName: person.displayName,
        bio: person.bio,
        passwordHash,
        emailVerifiedAt: now,
        onboardedAt: now,
      },
      update: { passwordHash, emailVerifiedAt: now, onboardedAt: now },
      select: { id: true },
    })
    users[person.username] = user.id
  }

  const genres = await prisma.genre.findMany({
    where: { slug: { in: ['literary', 'speculative', 'mystery'] } },
    select: { id: true },
  })

  // Everyone pins genres: the dashboard's third region needs them, and so does
  // the weekly digest, which deliberately never sends someone their own request.
  for (const person of PEOPLE) {
    const userId = users[person.username]!
    await prisma.userGenre.deleteMany({ where: { userId } })
    await prisma.userGenre.createMany({
      data: genres.map((genre, order) => ({ userId, genreId: genre.id, order })),
    })
  }

  const storyboard = await prisma.storyboard.create({
    data: {
      publicId: 'demoharbour',
      slug: 'the-ship-never-lands-demoharbour',
      title: HARBOUR.title,
      logline: HARBOUR.logline,
      type: 'NOVEL',
      visibility: 'PUBLIC',
      publicFrom: ago(40),
      ownerId: users.maya!,
      createdAt: ago(40),
      genres: { create: genres.map((genre) => ({ genreId: genre.id })) },
    },
    select: { id: true },
  })

  const version = await prisma.version.create({
    data: {
      storyboardId: storyboard.id,
      name: 'Main draft',
      isMain: true,
      createdById: users.maya!,
    },
    select: { id: true },
  })

  const sectionIds: string[][] = []
  for (const [chapterIndex, chapter] of HARBOUR.chapters.entries()) {
    const created = await prisma.chapter.create({
      data: {
        versionId: version.id,
        lineageId: randomUUID(),
        order: chapterIndex,
        title: chapter.title,
      },
      select: { id: true },
    })

    const ids: string[] = []
    for (const [sectionIndex, paragraphs] of chapter.sections.entries()) {
      const d = derive(paragraphs)
      const section = await prisma.section.create({
        data: {
          chapterId: created.id,
          lineageId: randomUUID(),
          order: sectionIndex,
          wordCount: d.wordCount,
        },
        select: { id: true },
      })
      const revision = await prisma.revision.create({
        data: {
          sectionId: section.id,
          contentJson: docOf(paragraphs),
          contentText: d.contentText,
          wordCount: d.wordCount,
          contentHash: d.contentHash,
          source: 'AUTHORED',
          authorId: users.maya!,
          createdAt: ago(35 - sectionIndex),
        },
        select: { id: true },
      })
      await prisma.section.update({
        where: { id: section.id },
        data: { currentRevisionId: revision.id },
      })
      ids.push(section.id)
    }
    sectionIds.push(ids)
  }

  const sectionLineage = async (id: string) =>
    (await prisma.section.findUniqueOrThrow({ where: { id }, select: { lineageId: true } }))
      .lineageId

  // ── 1. A resolved rewrite: Leah's suggestion was accepted, Arjun's went stale.
  const rewriteSectionId = sectionIds[0]![1]!
  const rewriteRequest = await prisma.contributionRequest.create({
    data: {
      publicId: 'demorewrite',
      storyboardId: storyboard.id,
      sectionId: rewriteSectionId,
      kind: 'REWRITE',
      title: 'The second entry is flat',
      ask: 'This section is meant to be the first hint that the previous harbourmaster knew something, but at the moment it just reports that pages are missing. It reads like an inventory. I want the same facts to land as unease rather than admin, without adding any new information — the reader should not learn anything here that they do not already learn, they should just feel differently about it. I have rewritten it four times and each one is worse.',
      preContext: `Ruth is the harbourmaster of a small northern port. Eleven years ago a ship was logged as arriving; it has never arrived, and every morning since, she has written down that it is still arriving. She does not explain this to anyone and nobody asks. The logbook is a physical object, kept in the harbour office, and she has inherited it from the previous harbourmaster, a man named Ferris who left without notice and whose name she avoids saying. The book is the only thing in the story anyone treats as authoritative. In this section she notices that some pages near the front are missing, and she does not investigate. That refusal is the point: Ruth's whole character is someone who keeps a record precisely so that she does not have to think about what it means. The tone through the book so far is dry and close, third person, almost entirely interior, and the sentences are short when she is avoiding something.`,
      toneNotes: 'Close third, dry. Short sentences when she is avoiding something.',
      constraints: [
        'Ruth does not investigate the missing pages',
        'No new facts — only the existing ones, felt differently',
        'Do not name Ferris',
      ],
      minWords: 120,
      maxWords: 400,
      state: 'RESOLVED',
      openedById: users.maya!,
      createdAt: ago(20),
      resolvedAt: ago(12),
    },
    select: { id: true },
  })

  const headOf = async (sectionId: string) =>
    (
      await prisma.section.findUniqueOrThrow({
        where: { id: sectionId },
        select: { currentRevisionId: true },
      })
    ).currentRevisionId!

  const rewriteBase = await headOf(rewriteSectionId)

  const leahParagraphs = [
    'The harbourmaster before her had kept the same book. He had not written the ship down once, which she had taken, at first, for carelessness.',
    'There were pages missing near the front. Not torn — cut, close to the spine, by someone who had taken their time about it.',
    'She had noticed this in her second week and had not looked again since. The book was eleven years of her handwriting now. Whatever was in the first part of it belonged to somebody else.',
    'She wrote the date. She wrote that the ship was still arriving. She closed the book and put it back on the shelf at the height it had always been.',
  ]
  const leahDerived = derive(leahParagraphs)

  const leahSuggestion = await prisma.suggestion.create({
    data: {
      publicId: 'demoleah',
      requestId: rewriteRequest.id,
      contributorId: users.leah!,
      baseRevisionId: rewriteBase,
      contentJson: docOf(leahParagraphs),
      contentText: leahDerived.contentText,
      wordCount: leahDerived.wordCount,
      note: 'I kept every fact and changed only the order — the cut pages arrive before her refusal to look, so the refusal reads as a choice rather than an oversight.',
      state: 'ACCEPTED',
      submittedAt: ago(16),
      decidedAt: ago(12),
      decidedById: users.maya!,
    },
    select: { id: true },
  })

  const acceptedRevision = await prisma.revision.create({
    data: {
      sectionId: rewriteSectionId,
      parentId: rewriteBase,
      contentJson: docOf(leahParagraphs),
      contentText: leahDerived.contentText,
      wordCount: leahDerived.wordCount,
      contentHash: leahDerived.contentHash,
      source: 'ACCEPTED',
      authorId: users.leah!,
      acceptedById: users.maya!,
      suggestionId: leahSuggestion.id,
      createdAt: ago(12),
    },
    select: { id: true },
  })
  await prisma.section.update({
    where: { id: rewriteSectionId },
    data: { currentRevisionId: acceptedRevision.id, wordCount: leahDerived.wordCount },
  })
  await prisma.credit.create({
    data: {
      storyboardId: storyboard.id,
      contributorId: users.leah!,
      type: 'PROSE',
      sectionLineage: await sectionLineage(rewriteSectionId),
      revisionId: acceptedRevision.id,
      suggestionId: leahSuggestion.id,
      isLive: true,
      createdAt: ago(12),
    },
  })

  // Arjun wrote against the old head, so accepting Leah's left his stale.
  const arjunParagraphs = [
    'The harbourmaster before her had kept the same book and had written nothing in it worth reading.',
    'Pages were missing at the front. She assumed damp, or mice, or one of the hundred small disasters a building like this produced without anyone deciding.',
    'She did not check. There was a tide to log and the light was already going.',
  ]
  const arjunDerived = derive(arjunParagraphs)
  await prisma.suggestion.create({
    data: {
      publicId: 'demoarjun',
      requestId: rewriteRequest.id,
      contributorId: users.arjun!,
      baseRevisionId: rewriteBase,
      contentJson: docOf(arjunParagraphs),
      contentText: arjunDerived.contentText,
      wordCount: arjunDerived.wordCount,
      note: 'Went further towards indifference — she is not avoiding anything, she genuinely does not care yet.',
      state: 'STALE',
      submittedAt: ago(15),
    },
  })
  await prisma.notification.create({
    data: {
      userId: users.arjun!,
      type: 'SUGGESTION_STALE',
      payload: { requestId: rewriteRequest.id },
      createdAt: ago(12),
    },
  })

  // ── 2. An open `continue` request with one suggestion waiting to be decided.
  const continueSectionId = sectionIds[1]![1]!
  const continueRequest = await prisma.contributionRequest.create({
    data: {
      publicId: 'democontinue',
      storyboardId: storyboard.id,
      sectionId: continueSectionId,
      kind: 'CONTINUE',
      title: 'I cannot write the answer to his question',
      ask: 'The inspector has just asked Ruth what she expects to happen when the ship finally arrives. It is the question the whole book has been avoiding and I have written her answer eleven times and every one of them is either too knowing or a joke. I need the paragraphs that come immediately after his question. She can answer or refuse to, but whatever she does has to be the first moment the reader suspects she has thought about this more than she lets on.',
      preContext: `Ruth has been harbourmaster of a small northern port for eleven years. On her first day she logged a ship as arriving; it did not arrive, and she has written the same entry every morning since. She has never explained it and nobody has ever asked — the town treats the logbook as a formality and Ruth as a fixture. She inherited the book from a predecessor who cut pages out of the front of it before leaving. She has never looked at what is missing, which is the closest thing she has to a principle. A man from the department has now come to read all eleven years of entries in order, which nobody has ever done, and he has read them in one sitting while she watched. He is not hostile. He is interested, which is worse. The book has been dry and close and almost entirely interior up to this point, and Ruth's habit under pressure is to answer a question with a procedural fact.`,
      toneNotes: 'She deflects with procedure when cornered. Let her do that, and let it fail.',
      constraints: ['She does not cry', 'The ship is never described', 'Keep it interior'],
      minWords: 150,
      maxWords: 500,
      state: 'ANSWERED',
      openedById: users.maya!,
      createdAt: ago(6),
    },
    select: { id: true },
  })

  const continueBase = await headOf(continueSectionId)
  const arjunContinue = [
    'She told him the arrival procedure. Two men on the north quay, the chain down, the log open on the desk rather than the shelf. She could hear herself doing it and she did not stop.',
    'He waited until she had finished, which took longer than it should have, and then he said that was not what he had asked.',
    'Ruth looked at the book. Eleven years, and every entry the same six words in her own hand, getting smaller down the page as the years went on and the pen got worse.',
    'What she expected was nothing. She had expected nothing for a decade and had written it down every day, which was not the same as believing it, and she understood suddenly that she did not know which of the two she had been doing.',
    'She said the tide was out and they would have to come back at four.',
  ]
  const arjunContinueDerived = derive(arjunContinue)
  await prisma.suggestion.create({
    data: {
      publicId: 'demowaiting',
      requestId: continueRequest.id,
      contributorId: users.arjun!,
      baseRevisionId: continueBase,
      contentJson: docOf(arjunContinue),
      contentText: arjunContinueDerived.contentText,
      wordCount: arjunContinueDerived.wordCount,
      note: 'She deflects with the arrival procedure, he refuses it, and the honest answer arrives as something she works out mid-sentence rather than something she decides to say.',
      state: 'SUBMITTED',
      submittedAt: ago(2),
    },
  })
  await prisma.notification.create({
    data: {
      userId: users.maya!,
      type: 'SUGGESTION_RECEIVED',
      payload: { requestId: continueRequest.id },
      createdAt: ago(2),
    },
  })

  // A passed suggestion, so "written but not used" has something in it (FR-6.11).
  const leahPassed = [
    'She said she expected the paperwork to be considerable.',
    'He did not laugh, and she found she was grateful for that, and then annoyed at being grateful.',
    'The light went off the water and the office got cold in the way it did every afternoon at this time of year, and neither of them moved to put a lamp on.',
  ]
  const leahPassedDerived = derive(leahPassed)
  await prisma.suggestion.create({
    data: {
      publicId: 'demopassed',
      requestId: continueRequest.id,
      contributorId: users.leah!,
      baseRevisionId: continueBase,
      contentJson: docOf(leahPassed),
      contentText: leahPassedDerived.contentText,
      wordCount: leahPassedDerived.wordCount,
      note: 'Played it as a joke she immediately regrets.',
      state: 'PASSED',
      passReason: 'DOES_NOT_FIT_VOICE',
      submittedAt: ago(4),
      decidedAt: ago(3),
      decidedById: users.maya!,
    },
  })

  // ── 2b. A close copy-edit, so the comparison view has a case where marks are
  // the right answer. The three cases above are all replacements, which FR-7.2.3
  // correctly renders as read-through with no marks; without this, the marks
  // half of FR-7.2 would never be visible in the demo.
  const openingSectionId = sectionIds[0]![0]!
  const copyEditRequest = await prisma.contributionRequest.create({
    data: {
      publicId: 'democopyedit',
      storyboardId: storyboard.id,
      sectionId: openingSectionId,
      kind: 'REWRITE',
      title: 'The opening is nearly right',
      ask: 'I think this is about eighty per cent there and I have stopped being able to see it. The rhythm of the first line is wrong and there is a repetition in the middle that I cannot locate. I do not want it reconceived — I want someone to go over it with a pencil and change as little as possible. If you find yourself rewriting whole sentences you have gone too far.',
      preContext: `Ruth has been harbourmaster of a small northern port for eleven years. On her first day a ship was logged as arriving. It did not arrive, and she has written the same entry every morning since, without explaining it to anyone and without anyone asking. This is the opening section of the book and it has to do two things at once: establish the ritual as completely ordinary, and let the reader feel that it is not. The voice is dry, close third, and slightly clipped. Nothing in this section should announce itself as strange — the strangeness has to arrive through how normally it is reported. The logbook is a physical object and Ruth treats it as the authority in her life.`,
      toneNotes: 'Change as little as possible. This is a pencil, not a pen.',
      constraints: ['Keep every fact', 'Keep the length within twenty words'],
      minWords: 120,
      maxWords: 400,
      state: 'ANSWERED',
      openedById: users.maya!,
      createdAt: ago(3),
    },
    select: { id: true },
  })

  const copyEditBase = await headOf(openingSectionId)
  const openingParagraphs = HARBOUR.chapters[0].sections[0]

  // A genuine copy-edit: same paragraphs, small changes inside them.
  const edited = [
    'The ship had been arriving for eleven years, and Ruth had written it down every morning of them.',
    openingParagraphs[1].replace(
      'which she took as a kind of rebuke',
      'which she took as a rebuke',
    ),
    'She did not believe in it any more, exactly. She believed in the writing down.',
    openingParagraphs[3].replace('sat looking at it for a long time', 'sat looking at it'),
  ]
  const editedDerived = derive(edited)

  await prisma.suggestion.create({
    data: {
      publicId: 'democopyedited',
      requestId: copyEditRequest.id,
      contributorId: users.leah!,
      baseRevisionId: copyEditBase,
      contentJson: docOf(edited),
      contentText: editedDerived.contentText,
      wordCount: editedDerived.wordCount,
      note: 'A comma in the first line so it lands on "eleven years", and two tightenings. The repetition you could not find is "a kind of" — it does nothing.',
      state: 'SUBMITTED',
      submittedAt: ago(1),
    },
  })
  await prisma.notification.create({
    data: {
      userId: users.maya!,
      type: 'SUGGESTION_RECEIVED',
      payload: { requestId: copyEditRequest.id },
      createdAt: ago(1),
    },
  })

  // ── 3. An `unblock` request with a thread of ideas, one credited.
  const unblockRequest = await prisma.contributionRequest.create({
    data: {
      publicId: 'demounblock',
      storyboardId: storyboard.id,
      sectionId: sectionIds[1]![0]!,
      kind: 'UNBLOCK',
      title: 'Does the inspector need a reason to be here?',
      ask: 'I have written the inspector as simply curious, and my worry is that a department does not send a man four hours north because one harbourmaster keeps writing the same line. Do I need to give him an official reason, or does inventing one wreck the thing where the book refuses to explain itself? I do not want prose for this, I want to know which way the hole should be shaped.',
      minWords: 150,
      maxWords: 1000,
      state: 'ANSWERED',
      openedById: users.maya!,
      createdAt: ago(9),
    },
    select: { id: true },
  })

  const helpfulIdea = await prisma.idea.create({
    data: {
      requestId: unblockRequest.id,
      authorId: users.leah!,
      body: "Give him a reason that is real but too small — a budget review of every port under a certain tonnage, scheduled years ago, nothing to do with her. Then the ship is not why he came, it is what he found. That keeps the book from explaining itself, because the explanation that exists is boring and true and about something else entirely. It also makes his interest feel like his own rather than the department's, which is the version that frightens her.",
      markedHelpful: true,
      createdAt: ago(8),
    },
    select: { id: true },
  })
  await prisma.credit.create({
    data: {
      storyboardId: storyboard.id,
      contributorId: users.leah!,
      type: 'IDEA',
      sectionLineage: await sectionLineage(sectionIds[1]![0]!),
      ideaId: helpfulIdea.id,
      isLive: true,
      createdAt: ago(7),
    },
  })
  await prisma.idea.create({
    data: {
      requestId: unblockRequest.id,
      authorId: users.maya!,
      parentId: helpfulIdea.id,
      body: 'The budget review is exactly it. It also gives me a reason he has to read all eleven years rather than skim — he is counting entries, not reading them, until he starts reading them.',
      createdAt: ago(7),
    },
  })
  await prisma.idea.create({
    data: {
      requestId: unblockRequest.id,
      authorId: users.arjun!,
      body: 'The other option is that he has no official reason at all and knows he has none, and that is why he is careful with her. A man acting on his own time is a different kind of threat to a man with a clipboard. Harder to write, but it means nobody can call the department and make him go away, which raises the pressure without you having to invent an institution.',
      createdAt: ago(6),
    },
  })

  // ── 4. A request nobody has answered, old enough for the seven-day nudge.
  //    FR-12.4's whole point is that this is a normal state, not a failure, so
  //    the demo should contain one rather than implying every ask gets answers.
  await prisma.contributionRequest.create({
    data: {
      publicId: 'demoquiet',
      storyboardId: storyboard.id,
      // Chapter one, section two: its rewrite request is RESOLVED, so the
      // one-open-request-per-section index leaves this section free.
      sectionId: sectionIds[0]![1]!,
      kind: 'UNBLOCK',
      title: 'Is the inspector reading the entries or counting them?',
      ask: 'Small thing that I cannot settle. When he goes through eleven years of the logbook in one sitting, is he reading them or counting them? Counting is funnier and colder and makes the moment he starts actually reading land harder. Reading is more generous to him and makes him a person sooner. I have written it both ways and I cannot tell which one the book wants, which usually means I am asking the wrong question about it.',
      minWords: 150,
      maxWords: 1000,
      state: 'OPEN',
      openedById: users.maya!,
      createdAt: ago(11),
    },
  })

  return 'created'
}

export const DEMO_PASSWORD = PASSWORD
export const DEMO_ACCOUNTS = PEOPLE.map((person) => `${person.username}@storyboard.invalid`)
