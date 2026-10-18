import type { Metadata } from 'next'
import Link from '@/components/link'

import {
  ACCOUNT_DELETION_GRACE_DAYS,
  BACKUP_RETENTION_DAYS,
  IMPORT_JOB_RETENTION_HOURS,
  SOFT_DELETE_GRACE_DAYS,
  TIME_ZONE_COOKIE_DAYS,
  UNCONFIRMED_ACCOUNT_RETENTION_DAYS,
  USED_TOKEN_RETENTION_DAYS,
} from '@/lib/schemas/constants'
import { contactAddress } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Privacy policy',
  description:
    'What Draftboard keeps about you, who processes it and where, what is public, how long things are kept, and your rights.',
}

const UPDATED = '18 October 2026'

/**
 * Phase 14, item 2.1 — the privacy policy, in plain language. Every claim is
 * checked against the code: the columns on `User`, the cookies the app sets
 * (`tz` and the sign-in library's), the retention constants, the processors in
 * `env.ts` and `docs/05-deployment.md`. Numbers come from `constants.ts`, so a
 * change there changes this page. "Run by its developer" is D-3's default
 * until the owner names an entity; "open to everyone" is D-19, the owner's
 * answer.
 */
export default function PrivacyPage() {
  const address = contactAddress()

  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="font-manuscript text-[30px] leading-tight font-medium text-ink">
        Privacy policy
      </h1>
      <p className="mt-3 max-w-measure text-[15px] leading-relaxed text-ink-soft">
        Draftboard is run by its developer, and this page says what it keeps about you, who else
        touches it, and what you can do about it. It is written to be read. Last updated {UPDATED}.
        Questions go to{' '}
        <a href={`mailto:${address}`} className="text-pencil hover:underline">
          {address}
        </a>
        .
      </p>

      <Section title="What is kept">
        <p>
          <strong className="font-medium text-ink">Your account:</strong> your email address, a hash
          of your password (never the password), your username, display name and bio, the genres you
          pinned, your reading and email preferences, when your account was created and, to the
          hour, when it was last active. If you sign in with Google, the address Google confirms.
        </p>
        <p>
          <strong className="font-medium text-ink">Your writing:</strong> your stories with every
          version, your suggestions and ideas, your reports, your credits, and your notifications.
        </p>
        <p>
          <strong className="font-medium text-ink">Operations:</strong> the address your requests
          come from, inside the records that limit how often an action can be repeated, kept for a
          day; the server&rsquo;s own logs, which the host keeps briefly; and, when an administrator
          suspends or closes an account, the note they left about it, which only administrators
          read.
        </p>
        <p>
          <strong className="font-medium text-ink">Nothing else.</strong> We do not ask your age,
          your location, or your real name, and we do not store them.
        </p>
      </Section>

      <Section title="Who processes it, and where">
        <ul className="list-disc space-y-1 pl-5">
          <li>Vercel runs the application, with its functions in Singapore.</li>
          <li>Prisma Postgres holds the database, in Singapore.</li>
          <li>
            Cloudflare R2 holds the manuscripts you import and the nightly backups, which are
            encrypted before they leave.
          </li>
          <li>
            Google delivers our email (through Gmail), and provides sign-in with Google for people
            who choose it.
          </li>
          <li>GitHub Actions runs the scheduled jobs and the nightly backup.</li>
        </ul>
        <p>None of them is given your data for any purpose of their own.</p>
      </Section>

      <Section title="What is public">
        <p>
          A public story and everything in it: its text, its requests for help, the suggestions and
          ideas sent to it, and the credit lines. Your profile: username, display name, bio, your
          counts, your calendar of days you helped, and your credits. There are no private messages;
          everything anyone writes to anyone is attached to a piece of work and visible to whoever
          can read that work.
        </p>
        <p>
          A private story is read only by its authors and the people they invite. What was sent to a
          story while it was private stays with the people who could read it then, even after it is
          made public.
        </p>
      </Section>

      <Section title="How long">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            A deleted account is frozen at once and erased after {ACCOUNT_DELETION_GRACE_DAYS} days:
            the address, the password, the name, the bio and every preference go. The writing stays,
            shown as a former member&rsquo;s, because other people&rsquo;s accepted suggestions and
            credits are in it. The username is never given to anyone else.
          </li>
          <li>
            A deleted story is kept for {SOFT_DELETE_GRACE_DAYS} days, in which its author can
            restore it, and then removed for good.
          </li>
          <li>
            An imported file you never turned into a story is removed after{' '}
            {IMPORT_JOB_RETENTION_HOURS} hours.
          </li>
          <li>Backups are kept for {BACKUP_RETENTION_DAYS} days.</li>
          <li>The records that limit repeated actions are dropped after a day.</li>
          <li>
            An address that signs up and never confirms is removed after{' '}
            {UNCONFIRMED_ACCOUNT_RETENTION_DAYS} days, with everything about it. Sign-in links that
            were used or have expired are dropped after {USED_TOKEN_RETENTION_DAYS} days.
          </li>
        </ul>
      </Section>

      <Section title="Your rights, and how to use them">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong className="font-medium text-ink">See and take your writing:</strong> every story
            you write can be exported, with its credits, from the story itself. For a copy of
            everything on your account, write to us until the button for it exists.
          </li>
          <li>
            <strong className="font-medium text-ink">Correct:</strong> your name, bio, genres and
            preferences are in your settings.
          </li>
          <li>
            <strong className="font-medium text-ink">Delete:</strong> your account, from your
            settings; a contribution record, from your profile, which removes your credit line from
            that story.
          </li>
          <li>
            <strong className="font-medium text-ink">Ask:</strong>{' '}
            <Link href="/contact" className="text-pencil hover:underline">
              reach a person
            </Link>
            .
          </li>
        </ul>
      </Section>

      <Section title="No tracking">
        <p>
          No advertising, no analytics, no tracking pixels, in the pages or in the email. The only
          cookies are the ones that sign you in, set by our sign-in library, and{' '}
          <code className="font-mono text-[13px]">tz</code>, which remembers your browser&rsquo;s
          time zone for {TIME_ZONE_COOKIE_DAYS} days so dates read right. All of them are necessary,
          so there is no consent banner.
        </p>
        <p>
          We send you email about your account that cannot be turned off, such as confirming your
          address or a password change, and email about what happens to your writing, every kind of
          which can be turned off in your settings or with one click from the email itself.
        </p>
      </Section>

      <Section title="Children">
        <p>Draftboard is open to everyone. We do not ask your age and do not store it.</p>
      </Section>

      <Section title="Security">
        <p>
          Passwords are hashed with Argon2id. Everything travels over HTTPS. Backups are encrypted
          before they leave the database. If you find a way to read, change or delete what you
          should not be able to,{' '}
          <Link href="/contact" className="text-pencil hover:underline">
            write to us
          </Link>{' '}
          before you tell anyone else.
        </p>
      </Section>

      <Section title="Changes">
        <p>When this page changes, the date at the top changes and the change is described here.</p>
      </Section>
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
