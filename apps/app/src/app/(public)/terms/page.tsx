import type { Metadata } from 'next'
import Link from '@/components/link'

import { ACCOUNT_DELETION_GRACE_DAYS, SUGGESTION_QUOTA } from '@/lib/schemas/constants'
import { contactAddress } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Terms of use',
  description:
    'Who may use Draftboard, who owns what, what a helper grants, and what moderation can do.',
}

const UPDATED = '24 October 2026'

/**
 * Phase 14, item 2.2 — the terms, in plain language. Every claim here is one
 * the code keeps: the licence a helper grants is decision 0047, moderation is
 * decisions 0018, 0045 and 0046, deletion is decision 0024. Numbers come from
 * `constants.ts`. "Run by its developer" is D-3's default until the owner
 * names an entity.
 */
export default function TermsPage() {
  const address = contactAddress()

  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="font-manuscript text-[30px] leading-tight font-medium text-ink">
        Terms of use
      </h1>
      <p className="mt-3 max-w-measure text-[15px] leading-relaxed text-ink-soft">
        Draftboard is a place where writers help each other with the passage they are stuck on. It
        is run by its developer. These are the terms you agree to by creating an account; they are
        short because the rules that matter day to day are the{' '}
        <Link href="/rules" className="text-pencil hover:underline">
          community rules
        </Link>
        . Last updated {UPDATED}.
      </p>

      <Section title="1. Who may use Draftboard">
        <p>
          Anyone may read what is public. To write here you need an account, and by creating one you
          agree to these terms and to the{' '}
          <Link href="/privacy" className="text-pencil hover:underline">
            privacy policy
          </Link>
          . One person, one account; a username is permanent and appears in every credit line you
          earn.
        </p>
      </Section>

      <Section title="2. Your writing stays yours">
        <p>
          You keep the copyright in everything you write here: your stories, your suggestions, your
          ideas. Draftboard takes only the licence it needs to run the service: to store your
          writing, show it to the people allowed to read it, keep it in backups, and copy it into
          the exports its authors ask for.
        </p>
        <p>
          A public story can be read by anyone, and anyone signed in can make a spin-off of it on
          Draftboard. A private story is read only by its authors and the people they invite.
        </p>
      </Section>

      <Section title="3. What a helper grants">
        <p>
          When you send a suggestion or an idea to somebody else&rsquo;s story, you keep its
          copyright, and you grant that story&rsquo;s authors a permanent, worldwide, non-exclusive,
          royalty-free licence to use, edit and publish it as part of that story, in any form and
          anywhere. You grant Draftboard the licence in section 2 for it too. The grant is made when
          you send; if the author passes, your words stay yours and stay on your profile.
        </p>
        <p>
          Credit is what the product keeps. A suggestion accepted into a story earns a permanent
          credit line that travels with the words, into spin-offs and exports. Authors who publish
          elsewhere are asked to carry it; that is a request, not a condition of the licence.
        </p>
      </Section>

      <Section title="4. Spin-offs and publishing">
        <p>
          You may publish your own story anywhere, in any form, with or without Draftboard. A
          spin-off made on Draftboard stays on Draftboard without anyone&rsquo;s permission. To
          publish a spin-off elsewhere you need the permission of the authors of the words it
          carries over, because their licence was to the story&rsquo;s authors, not to everyone who
          copies the story.
        </p>
        {/* Phase 14, item 7b.5 (decision 0044, D-2) — publishing on Draftboard. */}
        <p>
          A story&rsquo;s owner may also publish it here, as an edition: the main draft as it stands
          that day, which readers find at its own address while the working draft goes on changing.
          An edition is never changed and is not taken back; publishing again makes the next one,
          and the earlier ones stay readable. Editions are as private as the story: one made private
          takes its editions with it. When a public spin-off publishes an edition, the authors of
          the story it came from are told, and the edition names that story and its author.
          Publishing on Draftboard is not permission to publish anywhere else.
        </p>
      </Section>

      <Section title="5. Nothing here is private">
        <p>
          There are no private messages on Draftboard. Everything anyone writes to anyone is
          attached to a piece of work and visible to whoever can read that work. What you sent to a
          story while it was private stays with the people who could read it then.
        </p>
      </Section>

      <Section title="6. Moderation">
        <p>
          Anyone can report a story, a suggestion, an idea or an account. A person reads every
          report. An upheld report can hide what it was about, so that it reads as removed to
          everyone but its writer; nothing is deleted, and credit already earned stays. Ten upheld
          reports suspend an account: the person can no longer sign in or write, and their work
          stays readable. A suspension can be lifted, and an account can be banned or closed by an
          administrator. You can block a person yourself: they can still read your stories, and they
          cannot send you suggestions or ideas.
        </p>
        <p>
          A helper may have at most {SUGGESTION_QUOTA.contributor} suggestions waiting on any one
          story at a time.
        </p>
        <p>
          If you think a decision about you is wrong, write to{' '}
          <a href={`mailto:${address}`} className="text-pencil hover:underline">
            {address}
          </a>
          .
        </p>
      </Section>

      <Section title="7. Leaving">
        <p>
          You can delete your account from your settings. It is frozen at once and erased after{' '}
          {ACCOUNT_DELETION_GRACE_DAYS} days, a window in which you can change your mind and in
          which somebody who got into your account cannot destroy it in one click. Your writing
          stays, shown as a former member&rsquo;s, because other people&rsquo;s accepted suggestions
          and credits are in it. Your username is never given to anyone else.
        </p>
      </Section>

      <Section title="8. No warranty, and changes">
        <p>
          Draftboard is provided as it is, free of charge, by one person, without any warranty. It
          can be unavailable, and it can lose data, though it is backed up nightly and we work hard
          against both. It is not a publisher, and it does not check that the words anyone brings
          here are their own.
        </p>
        <p>
          When these terms change, the date at the top changes and the change is described on this
          page. Using Draftboard after that is agreeing to the new terms.
        </p>
      </Section>

      <p className="mt-10 text-[13.5px] text-ink-faint">
        Questions:{' '}
        <Link href="/contact" className="text-pencil hover:underline">
          reach a person
        </Link>
        .
      </p>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-9">
      <h2 className="font-manuscript text-[21px] font-medium text-ink">{title}</h2>
      <div className="mt-2 max-w-measure space-y-3 text-[14.5px] leading-relaxed text-ink-soft">
        {children}
      </div>
    </section>
  )
}
