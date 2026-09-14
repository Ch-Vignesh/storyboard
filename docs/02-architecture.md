# Storyboard — implementation architecture

Companion to `01-srs.md`. Every section cites the requirements it satisfies.

---

## 1. Stack

Chosen for one solo developer, and for continuity with what you already run on CaseNext — the fewer novel decisions per file, the faster this ships.

| Layer       | Choice                                             | Why this one                                                        |
| ----------- | -------------------------------------------------- | ------------------------------------------------------------------- |
| Framework   | Next.js 15, App Router, TypeScript strict          | Server components keep 120k-word manuscripts off the client (NFR-1) |
| API         | tRPC v11                                           | End-to-end types; no schema drift between client and server         |
| Validation  | Zod, shared between tRPC input and forms           | One source of truth for word bounds and constraints                 |
| ORM         | Prisma 7 + PostgreSQL 16                           | Transactions for FR-6.6; `citext`, `tsvector` later if search lands |
| Auth        | Auth.js v5, credentials + email verification       | FR-1.3 to FR-1.6                                                    |
| Editor      | TipTap 2 (ProseMirror) with a restricted schema    | FR-4.1; the schema restriction is the whole point                   |
| Styling     | Tailwind v4 + shadcn/ui, heavily overridden        | Tokens in §9                                                        |
| Email       | Resend + React Email                               | FR-12                                                               |
| Rate limits | Upstash Redis, sliding window                      | FR-13.3                                                             |
| Files       | Cloudflare R2, presigned uploads                   | FR-3.1 imports, FR-14.2 exports                                     |
| Jobs        | Inngest (digests, exports, hash stamping)          | FR-12.3, FR-13.6                                                    |
| Hosting     | Vercel + Neon                                      | Branch previews matter when you iterate alone                       |
| Tests       | Vitest (unit), Playwright (the six critical flows) | §8                                                                  |

**Libraries to pin now:** `diff` (jsdiff) for word-level marks, `mammoth` for `.docx` text+styles, `fountain-js` for screenplay parsing, `@tiptap/html` for server-side JSON↔HTML, `nanoid` for public ids.

---

## 2. The revision and version strategy

This is the single most consequential decision in the schema. Read this before touching Prisma.

### 2.1 The decision

**Copy the chapter/section tree when a version is created. Do not model a git DAG.**

A true DAG (branches as pointers, sections resolved by walking ancestry) is elegant and it is the wrong trade here. Every read becomes an ancestry walk, every diff becomes a merge-base computation, and the bugs that result are subtle and silent. Prose is small — a 120,000-word novel is about 700 KB of JSON. Copying it on version-create costs a rounding error of storage and buys you queries a junior developer could write correctly at 2 a.m.

### 2.2 How it works

- `Version` is a row on a storyboard. Exactly one has `is_main = true` (FR-10.2).
- Creating a version copies every `Chapter` and `Section` row, plus a pointer to each section's current `Revision`. Revisions themselves are **not** copied — they are immutable and shared.
- `lineage_id` is a UUID carried across copies. Two sections in different versions that descend from the same original share a `lineage_id`. This is how comparison across versions matches sections up (FR-7.5), and how credits survive (FR-9.5).
- A section's history is the chain `Revision.parent_id`. It crosses version boundaries naturally, because revisions are shared.

### 2.3 Consequences to hold in your head

- Comparing main to an alternate version = outer-join sections on `lineage_id`, then diff each pair's head revisions. Sections present in one side only are shown as added or removed.
- Promoting an alternate to main (FR-10.2) is a two-row `UPDATE` inside a transaction. No data moves.
- A spin-off (FR-10.3) copies the storyboard, its main version, and that tree. It records `forked_from_version_id` and a JSON `forked_revision_map` of `{lineage_id: revision_id}` so "what did it look like at the moment of the spin-off" is answerable forever without keeping the original's later state.
- Reverting (FR-8.4) inserts a new revision whose `content_json` equals an old one and whose `restored_from_id` points at it. The chain only ever grows.

### 2.4 Invariant

`Revision` rows are append-only. Enforce with a Postgres trigger, not application code (NFR-3):

```sql
create or replace function revision_immutable() returns trigger as $$
begin
  raise exception 'Revision rows are immutable (NFR-3)';
end $$ language plpgsql;

create trigger revision_no_update before update on "Revision"
  for each row execute function revision_immutable();
create trigger revision_no_delete before delete on "Revision"
  for each row execute function revision_immutable();
```

---

## 3. Data model

Prisma, abbreviated — omit obvious `@default(now())` and index noise in your head, but write them in the file.

```prisma
// ─────────── people

model User {
  id              String   @id @default(cuid())
  email           String   @unique
  emailVerifiedAt DateTime?
  passwordHash    String
  username        String   @unique          // immutable, FR-1.3
  displayName     String
  bio             String?  @db.VarChar(280)
  avatarUrl       String?
  status          UserStatus @default(ACTIVE) // ACTIVE | SUSPENDED | DELETED
  createdAt       DateTime @default(now())

  pinnedGenres    UserGenre[]
  storyboards     Storyboard[]   @relation("owner")
  collaborations  Collaborator[]
  suggestions     Suggestion[]
  ideas           Idea[]
  credits         Credit[]
  notifications   Notification[]
  reportsMade     Report[]       @relation("reporter")
  activity        ActivityDay[]
}

model Genre     { id String @id @default(cuid())  slug String @unique  name String  users UserGenre[]  storyboards StoryboardGenre[] }
model UserGenre { userId String  genreId String  order Int  @@id([userId, genreId]) }

// ─────────── the work

model Storyboard {
  id            String   @id @default(cuid())
  publicId      String   @unique              // nanoid, used in URLs
  slug          String                        // title slug + publicId suffix
  title         String
  logline       String?  @db.VarChar(300)
  type          StoryType                     // NOVEL NOVELLA SHORT SCREENPLAY STAGE_PLAY SERIAL POETRY NONFICTION OTHER
  visibility    Visibility @default(PUBLIC)   // PUBLIC | PRIVATE           FR-2.7
  state         StoryState @default(ACTIVE)   // ACTIVE | FINISHED | DELETED
  rightsNote    String?  @db.VarChar(500)     // FR-14.5, free text, unverified
  isSeed        Boolean  @default(false)      // FR-15.3
  publicFrom    DateTime?                     // FR-2.7 history cutoff

  ownerId       String
  owner         User @relation("owner", fields: [ownerId], references: [id])

  forkedFromId          String?               // FR-10.3
  forkedFrom            Storyboard? @relation("forks", fields: [forkedFromId], references: [id])
  forks                 Storyboard[] @relation("forks")
  forkedAt              DateTime?
  forkedRevisionMap     Json?                 // { lineageId: revisionId }

  versions      Version[]
  collaborators Collaborator[]
  genres        StoryboardGenre[]
  credits       Credit[]
  requests      ContributionRequest[]

  @@index([visibility, state, createdAt])
}

model Collaborator {
  id           String @id @default(cuid())
  storyboardId String
  userId       String
  role         CollabRole          // COAUTHOR  (owner is on Storyboard.ownerId, not here)
  invitedAt    DateTime @default(now())
  acceptedAt   DateTime?
  @@unique([storyboardId, userId])
}

model Version {
  id            String @id @default(cuid())
  storyboardId  String
  name          String                        // "Main draft", "Ship never lands"
  isMain        Boolean @default(false)       // exactly one true per storyboard
  baseVersionId String?                       // what it was copied from
  createdById   String
  createdAt     DateTime @default(now())
  chapters      Chapter[]
  @@unique([storyboardId, isMain], map: "one_main_per_storyboard")  // partial index, see note
}

model Chapter {
  id        String @id @default(cuid())
  versionId String
  lineageId String                            // shared across versions      §2.2
  order     Int
  title     String
  sections  Section[]
  @@index([versionId, order])
  @@index([lineageId])
}

model Section {
  id                String @id @default(cuid())
  chapterId         String
  lineageId         String
  order             Int
  title             String?
  currentRevisionId String?  @unique
  wordCount         Int      @default(0)
  mergedIntoId      String?                   // FR-2.4
  revisions         Revision[]  @relation("sectionRevisions")
  requests          ContributionRequest[]
  @@index([chapterId, order])
  @@index([lineageId])
}

model Revision {
  id             String   @id @default(cuid())
  sectionId      String
  parentId       String?
  contentJson    Json                         // canonical ProseMirror       FR-4.1
  contentText    String   @db.Text            // derived, for diff + counts  FR-4.3
  wordCount      Int
  contentHash    String                       // sha256 of contentText       FR-13.6
  source         RevisionSource               // AUTHORED | ACCEPTED | RESTORED | IMPORTED
  authorId       String                       // who wrote the words
  acceptedById   String?                      // who let them in             FR-8.1
  suggestionId   String?  @unique
  restoredFromId String?
  createdAt      DateTime @default(now())
  @@index([sectionId, createdAt])
}

// ─────────── help

model ContributionRequest {
  id            String @id @default(cuid())
  publicId      String @unique
  storyboardId  String
  sectionId     String
  kind          RequestKind                   // REWRITE | CONTINUE | UNBLOCK   FR-5.2
  title         String  @db.VarChar(120)
  ask           String  @db.Text              // 20–500 words                   FR-5.3
  preContext    String? @db.Text              // 100–500 words, required if REWRITE|CONTINUE
  toneNotes     String?
  constraints   Json?                         // string[]                       FR-5.6
  readingList   Json?                         // lineageId[]                    FR-5.5
  minWords      Int @default(150)
  maxWords      Int @default(1000)
  state         RequestState @default(OPEN)   // OPEN | ANSWERED | RESOLVED | CLOSED
  openedById    String
  createdAt     DateTime @default(now())
  resolvedAt    DateTime?
  suggestions   Suggestion[]
  ideas         Idea[]
  @@index([state, createdAt])
}

model Suggestion {
  id             String @id @default(cuid())
  publicId       String @unique
  requestId      String
  contributorId  String
  baseRevisionId String                       // staleness anchor              FR-6.3
  contentJson    Json
  contentText    String @db.Text
  wordCount      Int
  note           String? @db.VarChar(1200)    // FR-6.2
  state          SuggestionState @default(DRAFT)  // DRAFT SUBMITTED ACCEPTED PASSED STALE WITHDRAWN
  passReason     PassChip?                    // FR-6.10, fixed set, nullable
  submittedAt    DateTime?
  decidedAt      DateTime?
  decidedById    String?
  @@index([requestId, state])
  @@index([contributorId, state])
}

model Idea {
  id          String @id @default(cuid())
  requestId   String
  authorId    String
  parentId    String?                          // one level deep               FR-6.9
  body        String @db.Text                  // 20–400 words
  markedHelpful Boolean @default(false)
  createdAt   DateTime @default(now())
}

model Credit {
  id             String @id @default(cuid())
  storyboardId   String
  contributorId  String
  type           CreditType                    // PROSE | IDEA | COAUTHOR     FR-9.1
  sectionLineage String?
  revisionId     String?
  suggestionId   String?
  ideaId         String?
  isLive         Boolean @default(true)        // false when text removed     FR-8.5
  createdAt      DateTime @default(now())
  @@index([contributorId, createdAt])
  @@index([storyboardId])
}

// ─────────── plumbing

model Notification { id String @id @default(cuid())  userId String  type NotificationType  payload Json  readAt DateTime?  emailedAt DateTime?  createdAt DateTime @default(now())  @@index([userId, readAt]) }
model Report       { id String @id @default(cuid())  reporterId String  targetType ReportTarget  targetId String  category ReportCategory  note String?  state ReportState @default(OPEN)  createdAt DateTime @default(now())  @@unique([reporterId, targetType, targetId]) }
model ActivityDay  { userId String  day DateTime @db.Date  count Int @default(0)  @@id([userId, day]) }   // FR-9.3 calendar
model ImportJob    { id String @id @default(cuid())  userId String  fileKey String  format String  state ImportState  detectedBy String?  proposal Json?  storyboardId String?  createdAt DateTime @default(now()) }
model DiffCache    { key String @id  html Json  stats Json  createdAt DateTime @default(now()) }          // key = `${baseRevId}:${targetRevId}`  NFR-2
```

**Note on `one_main_per_storyboard`:** Prisma cannot express a partial unique index. Add it in a raw migration:

```sql
create unique index one_main_per_storyboard
  on "Version" ("storyboardId") where "isMain" = true;
```

---

## 4. The comparison engine (FR-7)

`lib/compare/` — pure functions, no database, fully unit-testable. This is the module most likely to be wrong, so build it first and test it hardest.

```ts
compare(base: string, target: string): ComparisonResult

type ComparisonResult = {
  mode: 'marks' | 'rewrite'
  rows: Array<{
    kind: 'same' | 'changed' | 'added' | 'removed'
    left?: { text: string; marks?: WordMark[] }
    right?: { text: string; marks?: WordMark[] }
  }>
  stats: { kept: number; changed: number; added: number; removed: number }
}
```

**Algorithm, in order:**

1. Split both sides on blank lines into paragraphs. Normalise each for matching only: lowercase, collapse whitespace, strip punctuation. Keep the original for display.
2. LCS over normalised hashes → exact matches, in order. These are `same`.
3. For unmatched paragraphs, compute Dice coefficient on word bigrams pairwise. Greedily pair anything ≥ **0.45**, respecting order (never cross two pairings). These are `changed`.
4. Remaining left-only = `removed`; right-only = `added`.
5. If `(same + changed) / max(leftCount, rightCount) < 0.30` → set `mode: 'rewrite'`, drop all word marks, return (FR-7.2.3).
6. Otherwise, for each `changed` pair run `diffWordsWithSpace` and emit word marks.

**Why 0.45 and 0.30:** a paragraph a writer _edited_ typically retains over half its bigrams; one they _replaced_ retains under a third. Put both in `lib/compare/constants.ts` with this comment, and tune against real data in phase 2 — do not scatter them through the code.

**Rendering:** deletions `<del>` (struck), insertions `<ins>` (underlined), both in blue pencil. Never colour-only (NFR-4).

**Caching:** key on `${baseRevisionId}:${targetRevisionId}`. Revisions are immutable, so the cache never invalidates. For an unsubmitted suggestion draft there is no stable target id — compute live, do not cache.

---

## 5. The import engine (FR-3)

`lib/import/` — a pipeline of pure stages, no AI at any point.

```
file → extract() → NormalisedDoc → detectChapters() → detectSections() → Proposal
                                                                            ↓
                                                              human review screen
                                                                            ↓
                                                                     commit() → Version tree
```

**extract(file) → NormalisedDoc**

| Format          | Tool                                            | Yields                                    |
| --------------- | ----------------------------------------------- | ----------------------------------------- |
| `.docx`         | `mammoth` with a style map → HTML → TipTap JSON | paragraphs + style names + page breaks    |
| `.md`           | `marked` → TipTap JSON                          | headings, emphasis                        |
| `.txt` / `.rtf` | plain split                                     | paragraphs only                           |
| `.fountain`     | `fountain-js`                                   | scene headings, act breaks, element types |
| `.fdx`          | XML parse                                       | same                                      |

`NormalisedDoc` is `{ blocks: Array<{ text, json, style?, isPageBreak }> }`. Everything downstream works on this one shape, so adding a format later touches exactly one file.

**detectChapters(doc) → { boundaries, strategy }** — the seven-strategy cascade in FR-3.3, first hit wins, returns which strategy fired so the review screen can say "from a heading style" rather than a confidence number.

**detectSections(chapterBlocks)** — scene-break glyphs (FR-3.4), then double blank lines, then a hard split every 1200 words if a chapter is still monolithic.

**The review screen is not optional.** `ImportJob.proposal` holds the proposal; nothing is written to `Chapter` or `Section` until the writer confirms. This is the honest answer to heuristics being imperfect — you are not trying to be right, you are trying to be transparent and fast to correct.

---

## 6. API surface (tRPC v11)

Routers under `server/api/routers/`. Every procedure is `publicProcedure`, `protectedProcedure`, or `authorProcedure` (asserts owner-or-coauthor on the storyboard in question, at the data layer per NFR-6).

```
auth        signUp · verifyEmail · resendVerification · setPassword · chooseUsername · pinGenres
user        me · byUsername · updateProfile · updateNotificationPrefs · activityCalendar

storyboard  create · get · listMine · browse · update · setVisibility · markFinished
            delete · invite · acceptInvite · removeCoauthor · listContributors
            spinOff · listSpinOffs · lineage

version     list · create · rename · promoteToMain · delete · compareVersions

chapter     create · rename · reorder · delete
section     create · split · merge · reorder · get · getWithHistory
            saveDraft · commitRevision · restoreRevision

request     create · get · listForStoryboard · listOpen · update · close · reopen
suggestion  startDraft · saveDraft · submit · withdraw · get · listForRequest
            accept · pass · rebase          // rebase = re-anchor a STALE one   FR-6.7
idea        post · reply · markHelpful · list

compare     revisions({ baseId, targetId }) · draftAgainstHead({ suggestionId })

import      createUploadUrl · analyse · getProposal · commit
export      request({ storyboardId, format }) · status · proofOfAuthorship   // FR-13.6

notify      list · markRead · markAllRead
report      create
admin       reportQueue · resolveReport · suspendUser · seedStatus
```

### 6.1 The three procedures that carry risk

**`suggestion.accept`** — the only place where concurrency genuinely matters (FR-6.6). One transaction, in this order:

```ts
await db.$transaction(
  async (tx) => {
    const section = await tx.$queryRaw`
    select * from "Section" where id = ${sectionId} for update` // row lock
    if (section.currentRevisionId !== suggestion.baseRevisionId && !opts.acknowledgedChange)
      throw new TRPCError({ code: 'CONFLICT' })

    const revision = await tx.revision.create({
      /* source: ACCEPTED, authorId: contributor,
                                                 acceptedById: actor, parentId: head */
    })
    await tx.section.update({
      where: { id: sectionId },
      data: { currentRevisionId: revision.id, wordCount },
    })
    await tx.suggestion.update({/* ACCEPTED */})
    await tx.suggestion.updateMany({
      // FR-6.7
      where: { requestId, state: 'SUBMITTED', id: { not: suggestionId } },
      data: { state: 'STALE' },
    })
    await tx.credit.create({/* PROSE, isLive: true */})
    await tx.contributionRequest.update({/* RESOLVED */})
  },
  { isolationLevel: 'Serializable' },
)
```

Notifications and activity-calendar updates go **after** the transaction, via Inngest. Never inside.

**`suggestion.submit`** — enforces the quota (FR-13.2) with a count inside the same transaction as the insert, or two people submitting simultaneously both pass the check.

**`section.restoreRevision`** — must walk credits for the section lineage and flip `isLive` on any whose revision is no longer an ancestor of the new head (FR-8.5), then notify.

### 6.2 Shared Zod schemas

`lib/schemas/` holds every bound in one place — word minimums, quota constants, the pass-reason chip enum, the request kinds. Client forms and tRPC inputs import the same object. A bound that exists in two files will drift.

---

## 7. Authorisation model

A single function, called at the data layer, not in route handlers:

```ts
can(actor: Actor, action: Action, resource: Resource): boolean
```

Backed by the matrix in SRS §3.2, expressed as a table in `lib/authz/matrix.ts` and covered by a unit test per row. Route handlers call `assertCan()`; components never decide permissions, they only read a `permissions` object the server already computed. This is the difference between a bug that hides a button and a bug that leaks an unpublished manuscript.

---

## 8. Testing priorities

Unit-test exhaustively:

- `lib/compare/` against a fixture corpus of real edits — light copy-edit, heavy edit, full rewrite, reordered paragraphs, added scene. Snapshot the `stats` output.
- `lib/import/` against one real file per supported format, including a `.docx` with no heading styles at all (the common case).
- `lib/authz/matrix.ts`, one test per cell.

Playwright, the six flows that must never break:

1. Sign up → verify → onboard → land on a populated dashboard.
2. Create storyboard → write a section → open a `continue` request.
3. Read a public storyboard as a guest → sign in → write and send a suggestion.
4. Author receives, compares, accepts → credit appears on both profiles.
5. Second suggestion goes stale → contributor rebases → author accepts → both credits present.
6. Restore an earlier revision → contributor is notified → credit shows as not live but still listed.

---

## 9. Design tokens

The prototype is the reference implementation. Token values:

```css
--paper: #fbfbf9; /* cool laser paper, not cream */
--paper-sunk: #f2f2ee; /* rails, wells */
--ink: #11202b; /* blue-black, manuscript text */
--ink-soft: #55636d; /* secondary */
--ink-faint: #8a949c; /* metadata */
--rule: #dfe0da; /* hairlines */
--pencil: #2b5ca8; /* blue pencil — links, insertions, primary action */
--pencil-wash: #e8eef7;
--ochre: #a8571b; /* stuck points, open requests */
--ochre-wash: #f7eee4;
--moss: #2e6b4f; /* accepted */
--moss-wash: #e6f0ea;
--crimson: #8c2b2b; /* deletions in comparison only */
```

Type: `Newsreader` (manuscript, 19px/1.65, measure 66ch) · `Archivo` (interface, 14–15px) · `Courier Prime` (screenplay content only). Radius 3px on controls, 0 on the page surface — paper does not have rounded corners. One shadow token, used only on the margin cards that overlap the page edge.

The memorable element is the **leader rule**: a 1px line from each margin card to the section it belongs to, which thickens and turns blue pencil on hover while the section highlights. Everything else stays quiet.

---

## 10. Environment

```
DATABASE_URL              NEXTAUTH_SECRET           NEXTAUTH_URL
RESEND_API_KEY            EMAIL_FROM
UPSTASH_REDIS_REST_URL    UPSTASH_REDIS_REST_TOKEN
R2_ACCOUNT_ID             R2_ACCESS_KEY_ID          R2_SECRET_ACCESS_KEY   R2_BUCKET
INNGEST_EVENT_KEY         INNGEST_SIGNING_KEY
NEXT_PUBLIC_APP_URL       NEXT_PUBLIC_MARKETING_URL
```

Two Vercel projects, one repo: `apps/web` (marketing, `storyboard.com`) and `apps/app` (`app.storyboard.com`). Shared packages: `packages/db`, `packages/compare`, `packages/import`, `packages/ui`. Turborepo. Splitting the marketing site out means you can rewrite it on a whim without touching the application.
