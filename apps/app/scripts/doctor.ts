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
 * object through the bucket, and, when asked, sends one real email.
 *
 *   pnpm check-deploy                      everything checkable for free
 *   pnpm check-deploy --email you@you.com  and send one real message, end to end
 *
 * Exits non-zero if anything failed, so it can gate a deploy.
 */
import { loadRootEnv } from '@storyboard/config/env'

loadRootEnv()

const wanted = process.argv.indexOf('--email')
const sendTo = wanted >= 0 ? process.argv[wanted + 1] : undefined

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
  const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL
  if (!url) {
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

  const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } =
    await import('@aws-sdk/client-s3')
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
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

  // The CORS rule cannot be checked from here — it is enforced by the browser,
  // not by the API — so say so rather than implying the bucket is finished.
  console.warn(
    '     note: the bucket CORS rule is not checkable from a shell. It is what makes the\n' +
      '           browser upload work, and it is the step most often missed. See docs/05-deployment.md.',
  )
}

async function checkMail(): Promise<void> {
  const key = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM

  if (!key) {
    skip('email', 'RESEND_API_KEY not set; messages print to the server log')
    return
  }
  if (!from) {
    record(false, 'email', 'EMAIL_FROM is not set')
    return
  }

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
    subject: 'Storyboard — this address can receive mail',
    text:
      'If you are reading this, the Resend key, the sending domain and EMAIL_FROM all work.\n\n' +
      'That is the whole check. Nobody can finish signing up until this message arrives,\n' +
      'because sign-up is an emailed link — so this is the one to get right before launch.\n',
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
