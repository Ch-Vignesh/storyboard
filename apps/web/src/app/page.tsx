import { Button } from '@storyboard/ui/components/button'

import { EXAMPLE, EXAMPLE_STORYBOARDS } from './example'

/**
 * FR-1.1 — the marketing home, and the sixty-second target.
 *
 * The hero is a real stuck passage with the suggestion that was accepted for
 * it, side by side, readable without an account. Not a screenshot and not a
 * feature list: the thing the product does, in the words it does it with. A
 * visitor should understand the whole loop before they have decided whether to
 * scroll.
 *
 * The passage is from a public-domain text (FR-15.2) and is one of the seeded
 * examples, so the link under it goes to the real storyboard rather than to a
 * mock-up of one.
 */
export default function HomePage() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3200'

  return (
    <>
      <header className="mx-auto max-w-5xl px-6 pt-10">
        <p className="font-manuscript text-[21px] font-medium tracking-tight text-ink">
          Storyboard
        </p>
      </header>

      <main id="main" className="mx-auto max-w-5xl px-6 pb-24">
        <section className="pt-16">
          <h1 className="max-w-[20ch] font-manuscript text-[44px] leading-[1.1] font-medium text-ink sm:text-[56px]">
            Stuck on chapter four? Ask a writer.
          </h1>
          <p className="mt-6 max-w-measure text-[17px] leading-relaxed text-ink-soft">
            Post the passage you cannot get past. Other writers propose prose for exactly that spot.
            You accept the one that fits, and their name stays on it for good.
          </p>
        </section>

        {/* The loop itself, in three columns that read as one sentence. */}
        <section className="mt-16 border-t border-rule pt-10" aria-labelledby="the-loop">
          <h2 id="the-loop" className="sr-only">
            How it works, on a real passage
          </h2>

          <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-14">
            <article>
              <h3 className="text-[12px] font-medium tracking-wide text-ochre uppercase">
                What the author was stuck on
              </h3>
              <p className="mt-3 text-[14.5px] leading-relaxed text-ink-soft">{EXAMPLE.ask}</p>
              <div className="mt-5 border-l-2 border-ochre/50 pl-5">
                <p className="font-manuscript text-[17px] leading-[1.7] text-ink">
                  {EXAMPLE.before}
                </p>
              </div>
              <p className="mt-3 text-[12.5px] text-ink-faint">
                {EXAMPLE.source} — in the public domain, seeded as an example.
              </p>
            </article>

            <article>
              <h3 className="text-[12px] font-medium tracking-wide text-moss uppercase">
                What another writer sent, and the author accepted
              </h3>
              <p className="mt-3 text-[14.5px] leading-relaxed text-ink-soft">{EXAMPLE.note}</p>
              <div className="mt-5 border-l-2 border-moss/60 bg-moss-wash/40 py-1 pl-5">
                <p className="font-manuscript text-[17px] leading-[1.7] text-ink">
                  {EXAMPLE.after}
                </p>
              </div>
              <p className="mt-3 text-[12.5px] text-ink-faint">
                Credited to {EXAMPLE.contributor} on the storyboard, on their profile, and in the
                front matter of every export. Permanently, and whatever happens to the passage
                later.
              </p>
            </article>
          </div>
        </section>

        {/* FR-1.1 — two real storyboards, readable with no account. */}
        <section className="mt-16 border-t border-rule pt-10" aria-labelledby="read-one">
          <h2 id="read-one" className="font-manuscript text-[26px] font-medium text-ink">
            Read one without signing up
          </h2>
          <p className="mt-2 max-w-measure text-[15px] leading-relaxed text-ink-soft">
            Both of these are real storyboards with real open requests. You need an account to help,
            and nothing to read.
          </p>

          <ul className="mt-6 divide-y divide-rule border-y border-rule">
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
        </section>

        {/* FR-1.1 — one call to action, and it is the only one on the page. */}
        <section className="mt-16 border-t border-rule pt-10">
          <h2 className="font-manuscript text-[26px] font-medium text-ink">
            Bring the chapter you are stuck on
          </h2>
          <p className="mt-2 max-w-measure text-[15px] leading-relaxed text-ink-soft">
            Start a storyboard, or bring a manuscript in from a .docx and correct where it thinks
            the chapters are. Either way you are asking for help on one passage at a time.
          </p>
          <div className="mt-7">
            <Button asChild variant="primary" size="lg">
              <a href={`${appUrl}/signup`}>Create an account</a>
            </Button>
          </div>
          <p className="mt-4 text-[13px] text-ink-faint">
            Already have one?{' '}
            <a href={`${appUrl}/signin`} className="text-pencil hover:underline">
              Sign in
            </a>
            .
          </p>
        </section>

        {/* FR-13.6, on the page where somebody decides whether to trust this. */}
        <section className="mt-16 border-t border-rule pt-10">
          <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
            Before you post anything
          </h2>
          <p className="mt-3 max-w-measure text-[14.5px] leading-relaxed text-ink-soft">
            Anyone can read a public storyboard, and anyone can copy what they read. No website can
            stop a screenshot and this one will not pretend to. What it does instead is timestamp
            and hash every version as you write it, so you can prove what you wrote and when — and
            you can keep a manuscript private and invite the people you know.
          </p>
        </section>
      </main>

      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-8 text-[13px] text-ink-faint">
          <span className="font-manuscript text-[15px] text-ink">Storyboard</span>
          {/* FR-13.4 — the rules at a permanent URL, linked from the footer. */}
          <a href={`${appUrl}/rules`} className="hover:text-ink hover:underline">
            How this place works
          </a>
          <a
            href="https://github.com/Ch-Vignesh/storyboard"
            className="hover:text-ink hover:underline"
          >
            Source
          </a>
          <span className="ml-auto">You need to be 13 or older to have an account.</span>
        </div>
      </footer>
    </>
  )
}
