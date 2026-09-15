import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Not here',
  // A 404 that could be a private draft must not invite a search engine to
  // keep the address around and try it again later.
  robots: { index: false, follow: false },
}

/**
 * The 404, which is a more important page here than in most products.
 *
 * Unpublished work does not answer 403 to a stranger — it answers 404, and a
 * reader who lacks permission is told exactly what somebody who guessed a URL
 * is told (SRS §3.2, NFR-6). That is deliberate: a 403 confirms that a
 * storyboard exists at that address, which is a leak dressed as politeness.
 *
 * The consequence is that this page is not an error screen people reach by
 * accident. It is the front door of every private draft in the product, and it
 * has to be written for two readers at once: somebody who mistyped, and somebody
 * who was sent a link to work that is not theirs to read. So it says what is
 * true for both — that there is nothing here *for you* — and it neither
 * apologises nor hints.
 */
export default function NotFound() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-[70svh] max-w-2xl flex-col justify-center px-6 py-16"
    >
      <p className="text-[11px] tracking-[0.09em] text-ink-faint uppercase">404</p>
      <h1 className="mt-3 font-manuscript text-[30px] leading-tight font-medium text-ink">
        There is nothing here to read
      </h1>
      <p className="mt-3 max-w-measure text-[15px] leading-relaxed text-ink-soft">
        Either this address is wrong, or the work that was here is a draft its author has not
        published. Unpublished writing is not listed and not readable, which is the point of it.
      </p>
      <p className="mt-3 max-w-measure text-[14.5px] leading-relaxed text-ink-soft">
        If somebody sent you this link and meant you to read it, they can add you to the storyboard
        from its settings.
      </p>

      <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[13.5px]">
        <Link href="/browse">Read something else</Link>
        <Link href="/">Go to your dashboard</Link>
      </div>
    </main>
  )
}
