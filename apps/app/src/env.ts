import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

import { deploymentProblems, deploymentWarnings, preflightReport } from './env-preflight'

/**
 * Typed, validated environment. Import `env` instead of reading process.env
 * so a missing variable fails at startup with its name, not at 2 a.m. with a
 * stack trace. Empty strings count as unset.
 */
export const env = createEnv({
  server: {
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.url(),
    AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
    AUTH_URL: z.url().optional(),
    AUTH_TRUST_HOST: z.string().optional(),
    EMAIL_FROM: z.string().min(3),
    RESEND_API_KEY: z.string().min(1).optional(),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).optional(),
    /** Dev and test only: the console mailer also appends each message here. */
    MAIL_LOG_FILE: z.string().min(1).optional(),
    /** Authorises /api/cron/[job] (decision 0012). Without it, no job runs. */
    CRON_SECRET: z.string().min(16, 'CRON_SECRET must be at least 16 characters').optional(),
    /**
     * Object storage for manuscript uploads (FR-3.1). All four or none: with
     * none, imports are written to `.uploads/` on the application server,
     * which is how a clone of this repository runs without a Cloudflare
     * account. See `server/storage`.
     */
    R2_ACCOUNT_ID: z.string().min(1).optional(),
    R2_ACCESS_KEY_ID: z.string().min(1).optional(),
    R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    R2_BUCKET: z.string().min(1).optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.url(),
    NEXT_PUBLIC_MARKETING_URL: z.url(),
  },
  // Next.js inlines NEXT_PUBLIC_* at build time only when referenced literally.
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    AUTH_URL: process.env.AUTH_URL,
    AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST,
    EMAIL_FROM: process.env.EMAIL_FROM,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    LOG_LEVEL: process.env.LOG_LEVEL,
    MAIL_LOG_FILE: process.env.MAIL_LOG_FILE,
    CRON_SECRET: process.env.CRON_SECRET,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET: process.env.R2_BUCKET,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_MARKETING_URL: process.env.NEXT_PUBLIC_MARKETING_URL,
  },
  emptyStringAsUndefined: true,
  skipValidation: process.env.SKIP_ENV_VALIDATION === '1',
})

/**
 * The second check: not "can this start" but "should this be facing the public".
 *
 * Server only — the client bundle has no business knowing whether a mail key is
 * set, and `env.RESEND_API_KEY` is not readable there anyway. Skipped alongside
 * the schema when `SKIP_ENV_VALIDATION` is set, so the two can be turned off
 * together for tooling that only needs the module to import.
 */
if (typeof window === 'undefined' && process.env.SKIP_ENV_VALIDATION !== '1') {
  const problems = deploymentProblems(env)
  if (problems.length) {
    if (process.env.ALLOW_INCOMPLETE_DEPLOYMENT === '1') {
      console.warn(preflightReport(problems))
    } else {
      throw new Error(preflightReport(problems))
    }
  }
  for (const warning of deploymentWarnings(env)) console.warn(`Warning: ${warning}`)
}
