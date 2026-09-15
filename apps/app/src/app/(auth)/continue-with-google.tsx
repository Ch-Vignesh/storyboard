import { signIn } from '@/auth'
import { googleConfigured } from '@/auth/google'
import { safeNext } from '@/lib/safe-next'

/**
 * FR-1.6 — "Continue with Google", on sign-in and sign-up.
 *
 * Renders nothing at all when the provider is not configured. Not a disabled
 * button and not a button that fails on click: a clone of this repository has
 * no Google project, and an option that cannot work should not be on the
 * screen.
 *
 * Below the email form rather than above it, deliberately. This product's
 * account is an email address and a permanent username; Google is a way of
 * proving the address, not the primary path, and putting it first would imply
 * otherwise to somebody who has no Google account and no reason to make one.
 */
export function ContinueWithGoogle({ next }: { next?: string | string[] | undefined }) {
  if (!googleConfigured()) return null

  const destination = safeNext(next)

  async function continueWithGoogle() {
    'use server'
    await signIn('google', { redirectTo: destination })
  }

  return (
    <>
      <div className="mt-7 flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-rule" />
        <span className="text-[12px] text-ink-faint">or</span>
        <span className="h-px flex-1 bg-rule" />
      </div>

      <form action={continueWithGoogle} className="mt-5">
        <button
          type="submit"
          className="flex min-h-11 w-full items-center justify-center gap-2.5 rounded-control border border-rule px-4 text-[14px] text-ink transition-colors hover:border-ink-faint"
        >
          {/* Google's mark, inline so it costs no request and no image host in
              the Content-Security-Policy (decision 0025). */}
          <svg viewBox="0 0 18 18" className="size-[18px]" aria-hidden focusable="false">
            <path
              fill="#4285F4"
              d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
            />
            <path
              fill="#34A853"
              d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
            />
            <path
              fill="#FBBC05"
              d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
            />
            <path
              fill="#EA4335"
              d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
            />
          </svg>
          Continue with Google
        </button>
      </form>
    </>
  )
}
