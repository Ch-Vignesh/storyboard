import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Community rules',
  description:
    'What a good suggestion is, why the quota exists, and what you are being trusted with.',
}

/**
 * FR-13.4 — the community rules, at a permanent URL.
 *
 * Four things the requirement names, and nothing else: what a good suggestion
 * is, the quota and why it exists, that authors may pass without explanation,
 * and that unpublished work is being trusted to you. No legalese, because
 * nobody reads legalese and these are the rules that actually matter.
 *
 * This page must not move. It is linked from sign-up, from the footer, and
 * from every report dialog; a dead link here is worse than no link.
 */
export default function RulesPage() {
  return (
    <main id="main" className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="font-manuscript text-[30px] leading-tight font-medium text-ink">
        How this place works
      </h1>
      <p className="mt-3 max-w-measure text-[15px] leading-relaxed text-ink-soft">
        Six things. They are short because they are the ones that matter, not because there is fine
        print somewhere else.
      </p>

      <section className="mt-10">
        <h2 className="font-manuscript text-[21px] font-medium text-ink">
          1. A good suggestion answers what was asked
        </h2>
        <p className="mt-2 max-w-measure text-[14.5px] leading-relaxed text-ink-soft">
          Read the request. Read the passage before it. Write the thing the author said they were
          stuck on, in their voice rather than yours, inside the word bounds they set. A suggestion
          that rewrites their book into your book is not help, however good the prose is.
        </p>
        <p className="mt-2 max-w-measure text-[14.5px] leading-relaxed text-ink-soft">
          You are writing into somebody else&rsquo;s manuscript. That is the whole job.
        </p>
      </section>

      <section className="mt-9">
        <h2 className="font-manuscript text-[21px] font-medium text-ink">
          2. Three at a time, per storyboard
        </h2>
        <p className="mt-2 max-w-measure text-[14.5px] leading-relaxed text-ink-soft">
          You can have three suggestions waiting for a decision on any one storyboard. When one is
          accepted, passed on, or withdrawn, the slot frees up. Drafts do not count.
        </p>
        <p className="mt-2 max-w-measure text-[14.5px] leading-relaxed text-ink-soft">
          The limit is not about you. Every suggestion is something a person has to read and decide
          about, and an author who opens their storyboard to thirty waiting suggestions closes it
          again. Three keeps the door open.
        </p>
      </section>

      <section className="mt-9">
        <h2 className="font-manuscript text-[21px] font-medium text-ink">
          3. An author can pass without explaining
        </h2>
        <p className="mt-2 max-w-measure text-[14.5px] leading-relaxed text-ink-soft">
          Passing on a suggestion is not a verdict on it or on you. It means the author went a
          different way, which is their right over their own book. They may attach a short reason
          and they may not, and neither is owed to you.
        </p>
        <p className="mt-2 max-w-measure text-[14.5px] leading-relaxed text-ink-soft">
          Arguing with a pass, or sending the same passage again, is the fastest way to be reported
          here.
        </p>
      </section>

      <section className="mt-9">
        <h2 className="font-manuscript text-[21px] font-medium text-ink">
          4. You are reading work nobody has published
        </h2>
        <p className="mt-2 max-w-measure text-[14.5px] leading-relaxed text-ink-soft">
          Most of what is here is a draft its author has not shown anyone else. Do not copy it, do
          not repost it, do not feed it to anything. If you would not do it to a manuscript a friend
          handed you in a pub, do not do it here.
        </p>
        <p className="mt-2 max-w-measure text-[14.5px] leading-relaxed text-ink-soft">
          We are honest about the limits of this: a browser cannot stop a screenshot, and we will
          not pretend otherwise. What the product does instead is timestamp and hash every version
          as it is written, so an author can prove what they wrote and when.
        </p>
      </section>

      <section className="mt-9">
        <h2 className="font-manuscript text-[21px] font-medium text-ink">
          5. Credit travels with the writing
        </h2>
        <p className="mt-2 max-w-measure text-[14.5px] leading-relaxed text-ink-soft">
          When a suggestion is accepted, the person who wrote it is credited permanently — on the
          storyboard, on their profile, and in the front matter of every export. That credit does
          not come off if the passage is later rewritten, and it cannot be removed by anyone except
          the contributor themselves.
        </p>
        <p className="mt-2 max-w-measure text-[14.5px] leading-relaxed text-ink-soft">
          If you publish a book that contains other people&rsquo;s writing, credit them wherever it
          goes. We ask this rather than enforce it; a product that claimed to police your
          acknowledgements page would be lying.
        </p>
      </section>

      <section className="mt-9">
        <h2 className="font-manuscript text-[21px] font-medium text-ink">
          6. Thirteen and over, and nothing private
        </h2>
        <p className="mt-2 max-w-measure text-[14.5px] leading-relaxed text-ink-soft">
          You need to be at least 13 to have an account here. We ask once and we do not store your
          age — a date of birth we cannot check is data we would be holding for no reason.
        </p>
        <p className="mt-2 max-w-measure text-[14.5px] leading-relaxed text-ink-soft">
          There is no private messaging on this site and there is not going to be. Every way one
          person can reach another — a request, a suggestion, an idea, a reply — is attached to a
          piece of writing and visible to everyone who can read it. If somebody writes something
          they should not, it is in public, and you can report it.
        </p>
      </section>

      <section className="mt-10 border-t border-rule pt-6">
        <h2 className="text-[12px] font-medium tracking-wide text-ink-faint uppercase">
          If something is wrong
        </h2>
        <p className="mt-3 max-w-measure text-[14.5px] leading-relaxed text-ink-soft">
          Every storyboard, suggestion, idea and profile can be reported. Reports are read by a
          person, nobody is told who reported what, and report counts are never shown publicly on
          anybody. Ten upheld reports suspend an account while the rest are reviewed — their writing
          stays where it is, because it is part of other people&rsquo;s manuscripts too.
        </p>
      </section>

      <p className="mt-10 text-[13px] text-ink-faint">
        <Link href="/" className="text-pencil hover:underline">
          Back to Storyboard
        </Link>
      </p>
    </main>
  )
}
