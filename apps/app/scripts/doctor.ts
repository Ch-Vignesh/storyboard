/**
 * `pnpm check-deploy` — is this deployment configured, and does any of it work?
 *
 * Phase 8 is five accounts, and the failure mode of account work is not an
 * error, it is silence: a key with a typo in it, a bucket with no CORS rule, a
 * sending domain that never finished verifying. Each of those looks like
 * nothing at all until somebody tries to sign up, and then looks like a bug in
 * the product.
 *
 * So this does what the startup preflight cannot. The preflight
 * (`env-preflight.ts`) asks whether the variables are *present*, which is all
 * it can safely do at boot — a check that phoned a third party on every start
 * would mean an outage somewhere else became an outage here. This asks whether
 * they are *right*, by using them: it connects to the database, round-trips an
 * object through the bucket, asks the bucket whether a browser may upload to
 * it, and, when asked, sends one real email.
 *
 *   pnpm check-deploy                      everything checkable for free
 *   pnpm check-deploy --origin https://…   and the bucket's CORS rule for that origin too
 *   pnpm check-deploy --backup-bucket …    and that the app's key is refused on the backups
 *   pnpm check-deploy --email you@you.com  and send one real message, end to end
 *
 * Exits non-zero if anything failed, so it can gate a deploy.
 */
import { loadRootEnv } from '@storyboard/config/env'

loadRootEnv()

const wanted = process.argv.indexOf('--email')
const sendTo = wanted >= 0 ? process.argv[wanted + 1] : undefined

/** Origins to check the CORS rule for besides NEXT_PUBLIC_APP_URL's, e.g. production from a laptop. */
const extraOrigins = process.argv.flatMap((arg, index) => {
  const value = process.argv[index + 1]
  return arg === '--origin' && value ? [value] : []
})

/** The backup bucket (decision 0033), which the application's key must not reach. */
const backupFlag = process.argv.indexOf('--backup-bucket')
const backupBucket = backupFlag >= 0 ? process.argv[backupFlag + 1] : undefined

type Result = { ok: boolean; name: string; detail: string; fix?: string }
const results: Result[] = []

function record(ok: boolean, name: string, detail: string, fix?: string): void {
  results.push({ ok, name, detail, fix })
  console.warn(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok && fix) console.warn(`       ${fix}`)
}

function skip(name: string, why: string): void {
  console.warn(`--   ${name} — ${why}`)
}

/** Never print a secret, but do prove which one is loaded. */
function fingerprint(secret: string): string {
  return `${secret.slice(0, 3)}…${secret.slice(-3)} (${String(secret.length)} chars)`
}

async function checkEnvironment(): Promise<void> {
  const { deploymentProblems, deploymentWarnings, isPubliclyReachable } =
    await import('../src/env-preflight')

  const env = {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? '',
    NEXT_PUBLIC_MARKETING_URL: process.env.NEXT_PUBLIC_MARKETING_URL ?? '',
    EMAIL_FROM: process.env.EMAIL_FROM ?? '',
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASSWORD: process.env.SMTP_PASSWORD,
    CRON_SECRET: process.env.CRON_SECRET,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET: process.env.R2_BUCKET,
  }

  const publicFacing = isPubliclyReachable(env.NEXT_PUBLIC_APP_URL)
  console.warn(
    `\nChecking ${publicFacing ? 'a public deployment' : 'a local machine'}: ${env.NEXT_PUBLIC_APP_URL || '(no NEXT_PUBLIC_APP_URL)'}\n`,
  )

  const problems = deploymentProblems(env)
  record(
    problems.length === 0,
    'every variable a public deployment needs',
    problems.length === 0 ? 'all present' : `${String(problems.length)} missing`,
    problems[0],
  )
  for (const warning of deploymentWarnings(env)) console.warn(`     note: ${warning}`)
}

async function checkDatabase(): Promise<void> {
  // The client below connects with DATABASE_URL, the URL the application uses.
  if (!process.env.DATABASE_URL) {
    record(false, 'database', 'DATABASE_URL is not set', 'Copy .env.example to .env.')
    return
  }

  // Through the product's own client rather than a raw driver: `pg` is not a
  // dependency of this app, and reaching the database the way the application
  // reaches it is the more honest test anyway.
  const { createPrismaClient } = await import('@storyboard/db')
  const db = createPrismaClient({ log: [] })
  try {
    const applied = await db.$queryRawUnsafe<Array<{ n: bigint }>>(
      `select count(*) as n from "_prisma_migrations" where finished_at is not null`,
    )
    // The invariants are hand-written SQL inside migrations, so a database
    // built any other way loses them silently. Same check the restore drill
    // makes, for the same reason.
    const triggers = await db.$queryRawUnsafe<Array<{ tgname: string }>>(
      `select tgname from pg_trigger where not tgisinternal and tgname like 'revision_no_%'`,
    )
    const ok = triggers.length === 2
    record(
      ok,
      'database',
      `reachable, ${String(applied[0]?.n ?? 0n)} migrations applied, immutability trigger ${ok ? 'present' : 'MISSING'}`,
      'Run `pnpm db:deploy` against DIRECT_DATABASE_URL, never `prisma db push`.',
    )
  } catch (error) {
    record(
      false,
      'database',
      String(error),
      'Check the connection string and that this IP is allowed to connect.',
    )
  } finally {
    await db.$disconnect().catch(() => undefined)
  }
}

async function checkObjectStore(): Promise<void> {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    skip('object storage', 'not configured; uploads go to .uploads/ on this server')
    return
  }

  const {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    ListObjectsV2Command,
  } = await import('@aws-sdk/client-s3')
  // The application's own client options, so what is checked here is the URL
  // shape a browser is really sent (path-style; see src/lib/r2.ts).
  const { R2_CLIENT_OPTIONS, r2Endpoint } = await import('../src/lib/r2')
  const s3 = new S3Client({
    ...R2_CLIENT_OPTIONS,
    endpoint: r2Endpoint(R2_ACCOUNT_ID),
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  })

  // A real round trip. Reading back is the half that matters: a write-only
  // token passes a put and fails every import afterwards.
  const key = `doctor/${String(Date.now())}.txt`
  const body = 'storyboard doctor'
  try {
    await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: body }))
    const got = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }))
    const read = await got.Body?.transformToString()
    await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }))
    record(read === body, 'object storage', `wrote, read and deleted ${key}`)
  } catch (error) {
    record(
      false,
      'object storage',
      String(error),
      'Check the four R2_* values, and that the token can read as well as write.',
    )
  }

  // The CORS rule is enforced by the browser, but the browser asks first: an
  // OPTIONS preflight, which a shell can send just as well. Same URL shape as a
  // real upload (a presigned PUT) and the same header, from each origin that
  // uploads. A missing rule is the step most often skipped, and in the browser
  // it shows up as a CORS error that says nothing about the bucket.
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner')
  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: 'doctor/cors-preflight.txt',
      ContentType: 'application/octet-stream',
    }),
    { expiresIn: 60 },
  )
  const origins = new Set<string>()
  for (const candidate of [process.env.NEXT_PUBLIC_APP_URL, ...extraOrigins]) {
    try {
      if (candidate) origins.add(new URL(candidate).origin)
    } catch {
      record(false, 'bucket CORS rule', `${candidate} is not a URL`)
    }
  }
  for (const origin of origins) await checkCors(url, origin)
  for (const origin of origins) await checkPolicyAllows(origin, new URL(url).origin)

  if (backupBucket) {
    await checkKeptOut(backupBucket, () =>
      s3.send(new ListObjectsV2Command({ Bucket: backupBucket, MaxKeys: 1 })),
    )
  }
}

/**
 * Whoever takes the server holds this key. If it can reach the backups, it can
 * delete them, and the backups are what you would restore from afterwards.
 * Listing is enough to tell, and writes nothing into a bucket under a lock.
 */
async function checkKeptOut(bucket: string, list: () => Promise<unknown>): Promise<void> {
  const name = `the app’s key is kept out of ${bucket}`
  const fix =
    'Make the application’s R2 token for its own bucket only, and replace the four R2_* ' +
    'values with the new one. See docs/05-deployment.md section 6.'
  try {
    await list()
    record(false, name, 'it can list that bucket', fix)
  } catch (error) {
    const code = (error as { name?: string }).name
    if (code === 'AccessDenied') {
      record(true, name, 'refused, as it should be')
    } else if (code === 'NoSuchBucket') {
      // A key scoped to one bucket is refused before it learns whether another
      // exists. Being told it does not exist means the key reaches every bucket.
      record(false, name, 'no bucket by that name, and a key that could tell', fix)
    } else {
      record(false, name, String(error))
    }
  }
}

/**
 * The other half of a browser upload: the page's own Content-Security-Policy
 * has to let it connect to the bucket. CORS can say yes and the policy still
 * say no, and then the upload dies in the browser with "Failed to fetch" —
 * which is how the first import on production failed (2026-10-15).
 */
async function checkPolicyAllows(origin: string, uploadOrigin: string): Promise<void> {
  const name = `${origin}'s policy lets the browser upload`
  let policy: string | null
  try {
    const response = await fetch(`${origin}/signin`, { redirect: 'manual' })
    policy = response.headers.get('content-security-policy')
  } catch {
    skip(name, 'nothing answered there; start the app to check it')
    return
  }
  const connect = policy
    ?.split(';')
    .map((directive) => directive.trim())
    .find((directive) => directive.startsWith('connect-src'))
  const allowed = Boolean(connect?.split(/\s+/u).includes(uploadOrigin))
  record(
    allowed,
    name,
    allowed ? `connect-src names ${uploadOrigin}` : `connect-src is "${connect ?? 'missing'}"`,
    'Uploads go to the R2 endpoint path-style (src/lib/r2.ts); the policy adds that ' +
      'endpoint when R2_ACCOUNT_ID is set (withObjectStore in src/lib/csp.ts).',
  )
}

async function checkCors(presignedPut: string, origin: string): Promise<void> {
  const name = `bucket CORS rule for ${origin}`
  const fix =
    'Add this origin to the bucket’s CORS policy, with PUT and the content-type header. ' +
    'See docs/05-deployment.md.'
  try {
    const response = await fetch(presignedPut, {
      method: 'OPTIONS',
      headers: {
        origin,
        'access-control-request-method': 'PUT',
        'access-control-request-headers': 'content-type',
      },
    })
    const allowOrigin = response.headers.get('access-control-allow-origin')
    const methods = response.headers.get('access-control-allow-methods') ?? ''
    const headers = (response.headers.get('access-control-allow-headers') ?? '').toLowerCase()
    const allowed =
      response.ok &&
      (allowOrigin === origin || allowOrigin === '*') &&
      /\bPUT\b/u.test(methods) &&
      (headers.includes('content-type') || headers === '*')
    record(
      allowed,
      name,
      allowed ? 'a browser there may upload' : `preflight answered ${String(response.status)}`,
      fix,
    )
  } catch (error) {
    record(false, name, String(error), fix)
  }
}

const testSubject = 'Draftboard — this address can receive mail'

function testText(provider: string): string {
  return (
    `If you are reading this, ${provider} and EMAIL_FROM all work.\n\n` +
    'That is the whole check. Nobody can finish signing up until this message arrives,\n' +
    'because sign-up is an emailed link — so this is the one to get right before launch.\n'
  )
}

async function checkMail(): Promise<void> {
  const key = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env

  if (!key && !SMTP_HOST && !SMTP_USER && !SMTP_PASSWORD) {
    skip('email', 'neither RESEND_API_KEY nor SMTP_* is set; messages print to the server log')
    return
  }
  if (!from) {
    record(false, 'email', 'EMAIL_FROM is not set')
    return
  }
  if (key) {
    await checkResend(key, from)
    return
  }
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) {
    record(
      false,
      'email',
      'SMTP is half configured',
      'Set SMTP_HOST, SMTP_USER and SMTP_PASSWORD together, or none of them.',
    )
    return
  }

  // The application's own SMTP mailer, not a second implementation of it.
  const { createSmtpMailer } = await import('../src/server/mail/smtp')
  const port = SMTP_PORT ? Number(SMTP_PORT) : 465
  const smtp = createSmtpMailer({
    host: SMTP_HOST,
    port,
    user: SMTP_USER,
    password: SMTP_PASSWORD,
    from,
  })
  const server = `${SMTP_HOST}:${String(port)}`

  try {
    if (!sendTo) {
      // A real login, so a wrong password fails here rather than at the first sign-up.
      await smtp.verify()
      record(true, 'email', `logged in to ${server} as ${SMTP_USER}, sending as ${from}`)
      console.warn('     note: pass --email you@example.com to actually send one and prove it.')
      return
    }
    const text = testText(`the SMTP login on ${server}`)
    await smtp.send({
      to: sendTo,
      subject: testSubject,
      text,
      // Product mail is always both parts (FR-12.5); an empty HTML part would
      // show as a blank message in clients that prefer it.
      html: text
        .split('\n\n')
        .map((paragraph) => `<p>${paragraph.replaceAll('\n', ' ')}</p>`)
        .join('\n'),
    })
    record(true, 'email', `sent to ${sendTo} through ${server} as ${from}`)
    console.warn('     note: now check it arrived, and whether it landed in spam.')
  } catch (error) {
    record(
      false,
      'email',
      String(error),
      'Check SMTP_USER and SMTP_PASSWORD. For Gmail the password is an app password, which ' +
        'needs 2-Step Verification on, and EMAIL_FROM should be the same address as SMTP_USER.',
    )
  }
}

async function checkResend(key: string, from: string): Promise<void> {
  if (!sendTo) {
    record(true, 'email', `key loaded ${fingerprint(key)}, sending as ${from}`, undefined)
    console.warn('     note: pass --email you@example.com to actually send one and prove it.')
    return
  }

  const { Resend } = await import('resend')
  const resend = new Resend(key)
  const { error } = await resend.emails.send({
    from,
    to: sendTo,
    subject: testSubject,
    text: testText('the Resend key, the sending domain'),
  })

  record(
    !error,
    'email',
    error ? String(error.message) : `sent to ${sendTo} as ${from}`,
    error
      ? 'Check the key, and that EMAIL_FROM is on a domain verified with the provider.'
      : 'Now check it arrived, and whether it landed in spam.',
  )
}

async function main(): Promise<void> {
  await checkEnvironment()
  await checkDatabase()
  await checkObjectStore()
  await checkMail()

  const failed = results.filter((result) => !result.ok)
  console.warn('')
  if (failed.length) {
    console.warn(`${String(failed.length)} of ${String(results.length)} checks failed.`)
    console.warn('docs/05-deployment.md has the order to do these in.')
    process.exitCode = 1
    return
  }
  console.warn(`All ${String(results.length)} checks passed.`)
  if (!sendTo) console.warn('Nothing has been emailed. Re-run with --email to prove that half.')
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
