/**
 * What has to be true before a deployment is allowed to face the public.
 *
 * `env.ts` already refuses to start without the variables the application
 * cannot run at all without. This is the other half: the variables it *can*
 * run without, badly, in ways that look like nothing is wrong.
 *
 * Every one of these was reachable before phase 8. With a public URL and no
 * `RESEND_API_KEY` the application starts, serves pages, accepts sign-ups, and
 * prints each verification link to stdout — so every new account is stranded
 * and the logs look healthy. With no `CRON_SECRET` every scheduled job answers
 * 503 forever, which is the correct thing for an unauthenticated endpoint that
 * sends email to do, and means no digest is ever delivered. Neither shows up as
 * an error anywhere, which is exactly what makes them worth a startup check:
 * the failure mode of a silent misconfiguration is a quiet product nobody can
 * use, discovered by a stranger rather than by us.
 *
 * **Why the public URL is the trigger and `NODE_ENV` is not.** `NODE_ENV` is
 * `production` for `next build`, for `next start` on a laptop, and for the
 * Playwright suite, none of which have — or want — a Resend key. What actually
 * distinguishes a deployment is that strangers can reach it, and the variable
 * that says so is `NEXT_PUBLIC_APP_URL`. Keying the check to that means it
 * fires on a self-hosted box exactly as it does on Vercel, which matches the
 * storage driver's reasoning: configuration decides, not a guessed environment.
 */

/** A deployment nobody outside the machine can reach is somebody developing. */
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', '[::1]'])

/** Set by Vercel and by Lambda. A filesystem here is per-instance and temporary. */
function onServerlessHost(): boolean {
  return Boolean(process.env.VERCEL ?? process.env.AWS_LAMBDA_FUNCTION_NAME)
}

export type PreflightInput = {
  NEXT_PUBLIC_APP_URL: string
  NEXT_PUBLIC_MARKETING_URL: string
  EMAIL_FROM: string
  RESEND_API_KEY?: string | undefined
  CRON_SECRET?: string | undefined
  R2_ACCOUNT_ID?: string | undefined
  R2_ACCESS_KEY_ID?: string | undefined
  R2_SECRET_ACCESS_KEY?: string | undefined
  R2_BUCKET?: string | undefined
}

export function isPubliclyReachable(appUrl: string): boolean {
  try {
    return !LOOPBACK.has(new URL(appUrl).hostname)
  } catch {
    // An unparseable URL is `env.ts`'s problem, not this file's.
    return false
  }
}

/**
 * Problems that should stop a public deployment from starting.
 *
 * Returns sentences, not codes: this is read once, at 2 a.m., by somebody who
 * has just pushed. Each says what is wrong, what it will silently do instead,
 * and which variable fixes it.
 */
export function deploymentProblems(
  env: PreflightInput,
  { serverless = onServerlessHost() }: { serverless?: boolean } = {},
): string[] {
  if (!isPubliclyReachable(env.NEXT_PUBLIC_APP_URL)) return []

  const problems: string[] = []

  if (!env.RESEND_API_KEY) {
    problems.push(
      'RESEND_API_KEY is not set. This deployment is reachable from the internet, so the ' +
        'console mailer would print every verification link and digest to stdout instead of ' +
        'sending it — nobody would be able to finish signing up.',
    )
  }

  if (env.EMAIL_FROM.includes('example.com')) {
    problems.push(
      `EMAIL_FROM is still the placeholder (${env.EMAIL_FROM}). It has to be an address on a ` +
        'domain verified with the mail provider, or every message is rejected or filed as spam.',
    )
  }

  if (!env.CRON_SECRET) {
    problems.push(
      'CRON_SECRET is not set. /api/cron/[job] fails closed without it, which is correct for a ' +
        'public endpoint that sends email and means no digest, nudge, prune or purge will ever ' +
        'run. Generate one with: openssl rand -hex 32',
    )
  }

  for (const [name, value] of [
    ['NEXT_PUBLIC_APP_URL', env.NEXT_PUBLIC_APP_URL],
    ['NEXT_PUBLIC_MARKETING_URL', env.NEXT_PUBLIC_MARKETING_URL],
  ] as const) {
    if (!value.startsWith('https://')) {
      problems.push(
        `${name} is not https (${value}). It is the host in every emailed verification link, and ` +
          'the session cookie is set with Secure.',
      )
    }
  }

  // The storage fallback is a deliberate feature — a self-hosted box with a
  // persistent disk runs fine on it (see `server/storage`). On a serverless
  // host it is not a fallback, it is a bug with a delay: each instance gets its
  // own temporary filesystem, so the upload the parser goes looking for is
  // usually on a machine that no longer exists.
  const r2 = env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET
  if (!r2 && serverless) {
    problems.push(
      'The four R2_* variables are not set, and this is a serverless host. Uploads would be ' +
        'written to a per-instance temporary filesystem, so an import would fail whenever the ' +
        'parse landed on a different instance from the upload.',
    )
  }

  return problems
}

/**
 * Warnings: real, but not worth refusing to start over.
 *
 * Separate from the list above because a self-hosted deployment with a
 * persistent disk and no object store is a supported way to run this, and
 * refusing to boot it would be this file overreaching.
 */
export function deploymentWarnings(
  env: PreflightInput,
  { serverless = onServerlessHost() }: { serverless?: boolean } = {},
): string[] {
  if (!isPubliclyReachable(env.NEXT_PUBLIC_APP_URL)) return []

  const r2 = env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET
  if (!r2 && !serverless) {
    return [
      'The four R2_* variables are not set, so uploaded manuscripts are written to .uploads/ on ' +
        'this server. That works, and it means uploads share the fate of this filesystem.',
    ]
  }
  return []
}

/** The message a refused deployment prints. One block, no stack trace worth reading. */
export function preflightReport(problems: string[]): string {
  const lines = problems.map((problem, index) => `  ${String(index + 1)}. ${problem}`)
  return [
    '',
    `This deployment is publicly reachable and ${String(problems.length)} thing${
      problems.length === 1 ? ' is' : 's are'
    } not configured:`,
    '',
    ...lines,
    '',
    'Set them and deploy again. See docs/05-deployment.md.',
    'To start anyway — a staging box where none of this matters — set',
    'ALLOW_INCOMPLETE_DEPLOYMENT=1, which downgrades all of the above to warnings.',
    '',
  ].join('\n')
}
