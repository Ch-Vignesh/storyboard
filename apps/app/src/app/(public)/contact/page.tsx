import type { Metadata } from 'next'
import Link from '@/components/link'

import { contactAddress } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Contact',
  description:
    'How to reach a person at Draftboard: for help, an appeal, work copied here, or a security problem.',
}

/**
 * Phase 14, item 2.5 — a way to reach a person. One address, four reasons to
 * use it, and what to expect. Public, because two of the four reasons belong
 * to people who cannot sign in: someone suspended, and someone whose work was
 * copied here without their having an account. The address is the
 * deployment's (`lib/site.ts`), never typed into this file.
 */
export default function ContactPage() {
  const address = contactAddress()

  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="font-manuscript text-[30px] leading-tight font-medium text-ink">
        Reach a person
      </h1>
      <p className="mt-3 max-w-measure text-[15px] leading-relaxed text-ink-soft">
        Draftboard is run by its developer, and this is the one address. Write to{' '}
        <a href={`mailto:${address}`} className="text-pencil hover:underline">
          {address}
        </a>
        . A person reads it, not a form, and a person answers.
      </p>

      <section className="mt-10">
        <h2 className="font-manuscript text-[21px] font-medium text-ink">Help with the site</h2>
        <p className="mt-2 max-w-measure text-[14.5px] leading-relaxed text-ink-soft">
          Something that does not work, a question the{' '}
          <Link href="/rules" className="text-pencil hover:underline">
            rules
          </Link>{' '}
          do not answer, or an account you cannot get into. Say which page you were on and what you
          saw.
        </p>
      </section>

      <section className="mt-9">
        <h2 className="font-manuscript text-[21px] font-medium text-ink">An appeal</h2>
        <p className="mt-2 max-w-measure text-[14.5px] leading-relaxed text-ink-soft">
          If your account has been suspended or closed and you think that is wrong, write from the
          address the account uses and say what you think happened. Suspensions are reviewed by a
          person, and a review can end one. Your stories stay readable while it is looked at.
        </p>
      </section>

      <section className="mt-9">
        <h2 className="font-manuscript text-[21px] font-medium text-ink">Your work, copied here</h2>
        <p className="mt-2 max-w-measure text-[14.5px] leading-relaxed text-ink-soft">
          If somebody has put your writing on Draftboard as their own, send the address of the story
          here and a way for us to see the original. You do not need an account to ask.
        </p>
      </section>

      <section className="mt-9">
        <h2 className="font-manuscript text-[21px] font-medium text-ink">A security problem</h2>
        <p className="mt-2 max-w-measure text-[14.5px] leading-relaxed text-ink-soft">
          If you have found a way to read, change or delete what you should not be able to, write
          here before you tell anyone else, with the steps to repeat it, and do not try it on other
          people&rsquo;s work. You will hear back within three days.
        </p>
      </section>
    </main>
  )
}
