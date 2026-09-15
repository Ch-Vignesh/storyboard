import { Button } from '@storyboard/ui/components/button'

import { ContentsRail } from './contents-rail'
import { EXAMPLES, EXAMPLE_STORYBOARDS } from './example'
import {
  Caret,
  CoffeeRing,
  Delete,
  Nib,
  PageCorner,
  Paperclip,
  Pilcrow,
  PunchHoles,
  Ribbon,
  Stet,
  Stitch,
  Transpose,
} from './marks'
import { Specimen } from './specimen'

/**
 * FR-1.1 — the marketing home, and the sixty-second target.
 *
 * Laid out as the product's own reader: a contents rail, prose at manuscript
 * measure, and notes in the margin joined by leader rules — which is what a
 * writer sees when a suggestion is waiting beside their paragraph. Somebody who
 * clicks through from here should not feel they have arrived somewhere else.
 *
 * The hero is a real stuck passage beside the suggestion that was accepted for
 * it, copied from the seed library so the links go to the storyboard being
 * described. Not a screenshot and not a feature list: the thing the product
 * does, in the words it does it with.
 *
 * Seven sections, in the order a stranger needs them: what it is, how to use
 * it, who it is for, what it is worth, how credit works, what comes in and goes
 * out, and what the product cannot do.
 */
export default function HomePage() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3200'

  return (
    <>
      {/* A pencil rule drawn across the top as the page is read. */}
      <div className="progress pointer-events-none fixed inset-x-0 top-0 z-20 h-0.5 origin-left scale-x-0 bg-pencil" />

      {/* The corner of the sheet, turning slowly as the page is read. Fixed to
          the viewport rather than the document so it stays a property of the
          paper rather than of the scroll position. */}
      <PageCorner className="tilt pointer-events-none fixed top-0 right-0 z-0 hidden size-14 text-ink-faint/60 md:block" />

      {/*
        `overflow-x: clip`, not `hidden`.
        The ruled backdrop behind the hero deliberately runs past the measure on
        both sides, which on a phone put 12px of the page outside the viewport
        and gave the whole document a sideways scroll. `clip` trims it without
        creating a scroll container — which `overflow: hidden` would, and that
        would silently break the `sticky` contents rail and margin notes inside.
      */}
      <div className="relative mx-auto max-w-[68rem] overflow-x-clip px-5">
        {/* Punched holes down the outside edge of the sheet, where a loose-leaf
            draft has them. Outside the measure entirely and only where there is
            real room for them, because at the rail's edge they read as specks
            of dirt rather than as holes. */}
        <PunchHoles className="drift pointer-events-none absolute top-44 -left-9 hidden w-4 text-ink-faint/35 2xl:block" />

        <header className="flex items-baseline justify-between gap-6 pt-6">
          <span className="font-manuscript text-[20px] font-medium tracking-tight text-ink">
            Storyboard
          </span>
          <nav aria-label="Quick links" className="flex gap-4 text-[13.5px]">
            <a href="#how" className="text-ink-soft hover:text-ink hover:underline">
              How it works
            </a>
            <a href="#credit" className="text-ink-soft hover:text-ink hover:underline">
              Credit
            </a>
            <a href={`${appUrl}/signup`} className="text-ink-soft hover:text-ink hover:underline">
              Start
            </a>
          </nav>
        </header>

        {/* The spread. The margin is a fixed 12rem — about a fifth — so it reads
            as a margin and never competes with the text it annotates. */}
        <div className="grid items-start gap-0 lg:grid-cols-[9.5rem_minmax(0,34rem)_12rem] lg:gap-x-12">
          <ContentsRail />

          <main id="main" className="min-w-0">
            {/* ── Hero */}
            <section className="relative py-12 lg:py-16">
              <div
                aria-hidden
                className="ruling pointer-events-none absolute -inset-x-8 -top-12 z-0 h-88"
              />
              {/* The red rule down the left of every exercise book ever ruled.
                  Ochre here, because ochre is what a stuck point is coloured
                  everywhere else in the product. */}
              <div
                aria-hidden
                className="pointer-events-none absolute -top-12 -left-8 z-0 hidden h-88 w-px bg-ochre/25 sm:block"
              />

              <div className="relative z-1">
                <h1 className="max-w-[15ch] font-manuscript text-[clamp(2.4rem,6.6vw,3.7rem)] leading-[1.05] font-medium tracking-[-0.015em] text-balance text-ink">
                  Stuck on chapter four? Ask a writer.
                </h1>
                {/* The insert mark, under the headline, drawing itself as the
                    page is read. It is the product's own notation: a caret is
                    where something is missing and prose has to go. */}
                <Caret className="draw mt-4 w-7 text-ochre" />

                <p className="mt-3 max-w-[42ch] text-[17px] leading-relaxed text-ink-soft">
                  Post the passage you cannot get past. Other writers propose prose for exactly that
                  spot. You accept the one that fits — and their name stays on it for good.
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Button asChild variant="primary" size="lg">
                    <a href={`${appUrl}/signup`}>Start a storyboard</a>
                  </Button>
                  <Button asChild size="lg">
                    <a href="#what">See how it works</a>
                  </Button>
                </div>

                {/* Clipped to the page. The one small lie that the thing below
                    is a sheet rather than a division of a document. */}
                <div className="relative">
                  <Paperclip className="pointer-events-none absolute -top-3 right-6 z-2 hidden w-6 -rotate-12 text-ink-faint/70 sm:block" />
                  <Specimen examples={EXAMPLES} />
                </div>
              </div>
            </section>

            <Stitch className="h-2 w-full text-rule" />

            {/* ── 1 */}
            <Section
              id="what"
              number="One"
              eyebrow="what it is"
              mark={<Pilcrow className="draw w-4" />}
            >
              <h2 className="font-manuscript text-[clamp(1.55rem,3.4vw,2.05rem)] leading-tight font-medium text-balance text-ink">
                A workshop for one passage at a time
              </h2>
              <Body>
                Storyboard is a place to put the paragraph that is not working and get writing back
                for it — not notes, not a critique, not &ldquo;have you considered&rdquo;. Actual
                prose, written for that spot, in your voice, inside the word count you asked for.
              </Body>
              <Body>
                Your manuscript lives here in chapters and sections, the way a book does. You mark
                one section as stuck, say what is wrong and what you need, and that request appears
                in the margin beside the passage for anyone reading. Everything else stays yours,
                and stays private until you decide otherwise.
              </Body>
            </Section>

            {/* ── 2 */}
            <Section
              id="how"
              number="Two"
              eyebrow="how you use it"
              mark={<Caret className="draw w-6" />}
            >
              <h2 className="font-manuscript text-[clamp(1.55rem,3.4vw,2.05rem)] leading-tight font-medium text-balance text-ink">
                Four steps, and you can stop after any of them
              </h2>

              <ol className="mt-2 flex list-none flex-col gap-6 p-0">
                <Step n="01" title="Bring the manuscript">
                  Start from nothing, or bring a file. The importer proposes where your chapters are
                  and shows you that proposal — with the first twelve words of each section — before
                  a single word is saved. Correct it, then confirm.
                </Step>
                <Step n="02" title="Mark what is stuck">
                  Choose the section and say which of three things you need: this rewritten, what
                  comes next, or just help thinking. Set the word bounds. Write the story so far, so
                  nobody has to read your whole book to help with one page.
                </Step>
                <Step n="03" title="Read what comes back">
                  Suggestions arrive as prose you can put side by side with what you have, word by
                  word. Take one, or take none. Passing needs no explanation — you can attach a
                  reason from a short list, and you can say nothing at all.
                </Step>
                <Step n="04" title="Accept, and it is yours">
                  Accepting writes the passage into your draft and records who wrote it and who let
                  it in. Nothing is overwritten — every version you have saved stays readable, and
                  you can put an old one back without losing the new one.
                </Step>
              </ol>
            </Section>

            {/* ── 3 */}
            <Section id="who" number="Three" eyebrow="who it is for">
              <h2 className="font-manuscript text-[clamp(1.55rem,3.4vw,2.05rem)] leading-tight font-medium text-balance text-ink">
                Two kinds of people, and they need each other
              </h2>

              <dl className="mt-2 flex flex-col gap-6">
                <Who term="Writers with a draft and a dead spot">
                  Novelists, screenwriters, short-story writers and poets who are eighty thousand
                  words in and have one chapter that will not turn. You do not need a workshop
                  group, a critique partner or a writing retreat to get past one paragraph.
                </Who>
                <Who term="Writers who would rather write than critique">
                  People who are better at solving somebody else&rsquo;s scene than starting their
                  own, and who want the practice on real problems. Every accepted suggestion is a
                  published credit with your name on it and a link that proves it.
                </Who>
                <Who term="And not, honestly, for everyone">
                  If you want line edits, a beta reader, or an opinion on your whole manuscript,
                  this is the wrong shape. It is built for one stuck passage at a time, and it is
                  narrow on purpose.
                </Who>
              </dl>
            </Section>

            {/* ── 4 */}
            <Section id="worth" number="Four" eyebrow="what it is worth">
              <h2 className="font-manuscript text-[clamp(1.55rem,3.4vw,2.05rem)] leading-tight font-medium text-balance text-ink">
                What you get that a writing group does not give you
              </h2>

              <dl className="mt-2 flex flex-col">
                <Row term="Prose, not notes">
                  Somebody writes the paragraph. You are not handed a diagnosis and left with it.
                </Row>
                <Row term="Nothing is ever lost">
                  Every version is kept and timestamped. Restoring an old one adds it to the top of
                  the history rather than rewinding anything.
                </Row>
                <Row term="No obligation either way">
                  You can pass on everything. Helpers can stop. Nobody is owed a reply and nobody
                  has signed up to be a critique partner.
                </Row>
                <Row term="Alternate drafts">
                  Try a different chapter four without losing the one you have, and compare them
                  side by side before deciding which is the main draft.
                </Row>
                <Row term="Nothing here is written by a machine">
                  No model wrote any of the prose, chose any of the chapters, or summarised any of
                  the writing. Every suggestion came from a person.
                </Row>
              </dl>
            </Section>

            {/* ── 5 */}
            <Section
              id="credit"
              number="Five"
              eyebrow="about credit"
              mark={<Stet className="w-9" />}
            >
              <h2 className="font-manuscript text-[clamp(1.55rem,3.4vw,2.05rem)] leading-tight font-medium text-balance text-ink">
                Credit is permanent, and it travels
              </h2>
              <Body>
                When a suggestion is accepted, the person who wrote it is credited — and that credit
                is not a thank-you in a comment thread. It is a record that outlives the sentence.
              </Body>

              <div className="bg-surface flex flex-col gap-3.5 border border-rule p-6">
                <p className="text-[10.5px] tracking-[0.09em] text-ink-faint uppercase">
                  A credit line, as it appears in an export
                </p>
                <div className="grid gap-0.5">
                  <strong className="font-medium text-ink">Margaret Okonjo</strong>
                  <span className="text-[15px] leading-relaxed text-ink-soft">
                    wrote a passage in chapter two of <em>The ship never lands</em> — 4 March 2026
                  </span>
                </div>
                <p className="font-screenplay text-[11.5px] leading-relaxed break-all text-ink-faint">
                  sha256 3f9c1a…e71b · storyboard.com/s/the-ship-never-lands-k3x9q2
                </p>
                <p className="text-[12.5px] leading-relaxed text-ink-faint">
                  Printed in the front matter of every .docx, .md and .pdf you export. Not removable
                  from inside the product.
                </p>
              </div>

              <Body>
                It stays even if you later rewrite the passage — the writing changed, the fact that
                they helped did not. It follows the book if somebody starts their own version of
                your story. And it can be removed by exactly one person: the contributor themselves,
                who can erase their record at any time, in which case the prose stays and their name
                becomes &ldquo;a former contributor&rdquo;.
              </Body>
            </Section>

            {/* ── 6 */}
            <Section
              id="inout"
              number="Six"
              eyebrow="in and out"
              mark={<Transpose className="draw w-9" />}
            >
              <h2 className="font-manuscript text-[clamp(1.55rem,3.4vw,2.05rem)] leading-tight font-medium text-balance text-ink">
                It is your manuscript, arriving and leaving
              </h2>
              <Body>
                Nothing here is a lock-in. You bring the book you already have, and you can take it
                out again at any point, in a format somebody else can open.
              </Body>

              <div className="flex flex-col gap-2">
                <p className="text-[10.5px] tracking-[0.09em] text-ink-faint uppercase">
                  Comes in as
                </p>
                <Formats of={['.docx', '.md', '.txt', '.rtf', '.fountain', '.fdx']} />
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-[10.5px] tracking-[0.09em] text-ink-faint uppercase">
                  Goes out as
                </p>
                <Formats of={['.docx', '.md', '.pdf', '.fountain']} />
              </div>

              <Body>
                The importer never writes anything until you have seen where it thinks your chapters
                are and corrected it. On the way out, every file carries a contributors page in its
                front matter and the address it came from at the foot — which is the one thing you
                cannot turn off, because it is how credit travels with the work.
              </Body>
            </Section>

            {/* ── 7 */}
            <Section
              id="honest"
              number="Seven"
              eyebrow="the honest part"
              mark={<Delete className="draw w-11" />}
            >
              {/* Cold coffee. Behind the one section that admits what the
                  product cannot do, because that is the section somebody wrote
                  at two in the morning. */}
              <CoffeeRing className="drift-far pointer-events-none absolute -top-2 right-2 -z-1 w-40 text-ochre/25" />
              <h2 className="font-manuscript text-[clamp(1.55rem,3.4vw,2.05rem)] leading-tight font-medium text-balance text-ink">
                What we cannot do
              </h2>

              <div className="flex flex-col gap-3 border-l-2 border-ochre bg-ochre-wash py-5 pr-6 pl-6">
                <p className="text-[16px] leading-relaxed text-ink">
                  Anyone can read a public storyboard, and anyone can copy what they read. No
                  website can stop a screenshot, and this one will not pretend to.
                </p>
                <p className="text-[16px] leading-relaxed text-ink">
                  What it does instead is timestamp and hash every version as you write it, so you
                  can prove what you wrote and when — and you can keep a manuscript private and
                  invite only the people you know.
                </p>
              </div>

              <Body>
                There is no private messaging here and there is not going to be. Everything anyone
                writes to anyone is attached to a piece of work and visible to whoever can read it.
              </Body>
            </Section>

            {/* ── Read one, then close */}
            <Section id="read" number="" eyebrow="read one without signing up">
              <h2 className="font-manuscript text-[clamp(1.55rem,3.4vw,2.05rem)] leading-tight font-medium text-balance text-ink">
                Two real storyboards, open to anyone
              </h2>
              <ul className="mt-2 divide-y divide-rule border-y border-rule">
                {EXAMPLE_STORYBOARDS.map((storyboard) => (
                  <li key={storyboard.slug}>
                    <a
                      href={`${appUrl}/s/${storyboard.slug}`}
                      className="flex items-baseline justify-between gap-6 py-4 hover:bg-paper-sunk"
                    >
                      <span className="min-w-0">
                        <span className="block font-manuscript text-[19px] text-ink">
                          {storyboard.title}
                        </span>
                        <span className="mt-0.5 block text-[13px] text-ink-soft">
                          {storyboard.blurb}
                        </span>
                      </span>
                      <span className="shrink-0 text-[12.5px] text-pencil">Read it →</span>
                    </a>
                  </li>
                ))}
              </ul>
            </Section>

            <section id="start" className="rise relative border-t border-rule py-14 lg:py-20">
              {/* The marker ribbon, where a reader would leave one: at the end
                  of what they have read so far. */}
              <Ribbon className="pointer-events-none absolute -top-px right-8 hidden w-4 text-pencil sm:block" />
              {/* And a nib put down beside the last thing on the page, which is
                  the only place on it where somebody is being asked to write. */}
              <Nib className="sway pointer-events-none absolute top-24 -left-16 hidden w-5 rotate-12 text-ink-faint/50 xl:block" />
              <div className="flex flex-col gap-4">
                <h2 className="font-manuscript text-[clamp(1.55rem,3.4vw,2.05rem)] leading-tight font-medium text-balance text-ink">
                  Bring the chapter you are stuck on
                </h2>
                <p className="max-w-[38ch] text-[16px] leading-relaxed text-ink-soft">
                  Start a storyboard, or import the manuscript you already have. Either way you are
                  asking for help on one passage at a time.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-4">
                  <Button asChild variant="primary" size="lg">
                    <a href={`${appUrl}/signup`}>Create an account</a>
                  </Button>
                  <span className="text-[12.5px] text-ink-faint">Free while it is small.</span>
                </div>
              </div>
            </section>
          </main>

          {/* ── The margin. Decorative drift only; the text never moves. */}
          <aside aria-label="Notes" className="relative mt-6 lg:sticky lg:top-10 lg:mt-0">
            {/* A transpose mark loose in the margin, at the angle a hand makes
                rather than the angle a grid does. */}
            <Transpose className="sway pointer-events-none absolute -top-8 right-2 hidden w-8 -rotate-6 text-ink-faint/40 lg:block" />
            <div className="drift">
              <Note title="In the margin">
                This is where open requests sit when you read somebody&rsquo;s manuscript — beside
                the passage they belong to, joined by a leader rule.
              </Note>
              <Note title="Vocabulary">{REFUSED_WORDS}</Note>
              <Note title="Open source">
                AGPL-3.0. The whole thing is readable, including the parts that decide who can see
                your manuscript.
              </Note>
            </div>
          </aside>
        </div>

        <footer className="flex flex-wrap items-baseline gap-x-6 gap-y-3 border-t border-rule pt-8 pb-12 text-[13px] text-ink-faint">
          <span className="font-manuscript text-[16px] font-medium text-ink">Storyboard</span>
          <a href={`${appUrl}/rules`} className="text-ink-soft hover:text-ink hover:underline">
            How this place works
          </a>
          <a
            href="https://github.com/Ch-Vignesh/storyboard"
            className="text-ink-soft hover:text-ink hover:underline"
          >
            Source
          </a>
          <span className="ml-auto">
            Everything anyone writes here is visible to whoever can read the work.
          </span>
        </footer>
      </div>
    </>
  )
}

/**
 * The one sentence in the product that names the words the product refuses to
 * use. The vocabulary linter would otherwise reject this file, correctly — the
 * escape hatch exists for exactly this case, and this is the only use of it in
 * anything a reader sees.
 */
// prettier-ignore
// vocabulary-ok
const REFUSED_WORDS = 'No “merge”, “commit” or “pull request” anywhere. A storyboard has chapters and sections, a request is somebody stuck, a version is a draft.'

/** One numbered section, with the rhythm set once so nothing fights it later. */
function Section({
  id,
  number,
  eyebrow,
  mark,
  children,
}: {
  id: string
  number: string
  eyebrow: string
  /**
   * The proof mark for this section, chosen for what the mark *means* rather
   * than for variety: a pilcrow where a new thing begins, a caret where prose
   * is inserted, stet where an author declines one, transpose where work moves
   * in and out. A reader who knows the notation gets a second reading of the
   * page; one who does not sees marginalia, which is the right first reading.
   */
  mark?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section id={id} className="rise relative border-t border-rule py-14 lg:py-20">
      {mark ? (
        <div
          aria-hidden
          className="sway pointer-events-none absolute top-12 -left-14 hidden text-ink-faint/60 xl:block"
        >
          {mark}
        </div>
      ) : null}
      <div className="flex flex-col gap-4">
        <p className="text-[10.5px] tracking-[0.09em] text-ink-faint uppercase">
          {number ? `${number} — ` : ''}
          {eyebrow}
        </p>
        {children}
      </div>
    </section>
  )
}

function Body({ children }: { children: React.ReactNode }) {
  return <p className="text-[16px] leading-[1.68] text-ink-soft">{children}</p>
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[2rem_1fr] items-start gap-3.5">
      <span
        aria-hidden
        className="drift-tiny pt-1 font-screenplay text-[13px] text-pencil tabular-nums"
      >
        {n}
      </span>
      <div>
        <h3 className="mb-1 font-manuscript text-[18px] leading-snug font-medium text-ink">
          {title}
        </h3>
        <p className="text-[16px] leading-[1.68] text-ink-soft">{children}</p>
      </div>
    </li>
  )
}

function Who({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="font-manuscript text-[18px] text-ink">{term}</dt>
      <dd className="m-0 text-[15.5px] leading-relaxed text-ink-soft">{children}</dd>
    </div>
  )
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-rule py-4 first:pt-0 sm:grid-cols-[12rem_1fr] sm:items-baseline sm:gap-x-6">
      <dt className="text-[15px] font-medium text-ink">{term}</dt>
      <dd className="m-0 text-[15px] leading-relaxed text-ink-soft">{children}</dd>
    </div>
  )
}

function Formats({ of }: { of: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {of.map((format) => (
        <span
          key={format}
          className="rounded-control border border-rule px-2 py-1 font-screenplay text-[12px] whitespace-nowrap text-ink-soft"
        >
          {format}
        </span>
      ))}
    </div>
  )
}

/** A margin note, tied to the measure by a leader rule. */
function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="relative mt-7 flex flex-col gap-1.5 pl-5 before:absolute before:top-[0.6em] before:left-0 before:h-px before:w-3 before:bg-rule first:mt-0">
      <p className="text-[10.5px] tracking-[0.09em] text-ink-faint uppercase">{title}</p>
      <p className="text-[12px] leading-relaxed text-ink-faint">{children}</p>
    </div>
  )
}
