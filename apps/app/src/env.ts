import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

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
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_MARKETING_URL: process.env.NEXT_PUBLIC_MARKETING_URL,
  },
  emptyStringAsUndefined: true,
  skipValidation: process.env.SKIP_ENV_VALIDATION === '1',
})
