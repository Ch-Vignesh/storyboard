import { describe, expect, it } from 'vitest'

import {
  deploymentProblems,
  deploymentWarnings,
  isPubliclyReachable,
  preflightReport,
} from './env-preflight'

/** A deployment with nothing wrong with it, to vary one thing at a time from. */
const configured = {
  NEXT_PUBLIC_APP_URL: 'https://app.storyboard.example',
  NEXT_PUBLIC_MARKETING_URL: 'https://storyboard.example',
  EMAIL_FROM: 'Storyboard <hello@storyboard.example>',
  RESEND_API_KEY: 're_live_key',
  CRON_SECRET: 'a'.repeat(64),
  R2_ACCOUNT_ID: 'account',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKET: 'bucket',
}

/** What a laptop looks like: the same variables, unset, on localhost. */
const local = {
  NEXT_PUBLIC_APP_URL: 'http://localhost:3200',
  NEXT_PUBLIC_MARKETING_URL: 'http://localhost:3201',
  EMAIL_FROM: 'Storyboard <hello@example.com>',
}

describe('what counts as publicly reachable', () => {
  it.each(['http://localhost:3200', 'http://127.0.0.1:3100', 'http://[::1]:3200'])(
    'treats %s as somebody developing',
    (url) => {
      expect(isPubliclyReachable(url)).toBe(false)
    },
  )

  it('treats a real host as a deployment', () => {
    expect(isPubliclyReachable('https://app.storyboard.example')).toBe(true)
  })

  it('does not throw on a URL the schema will reject anyway', () => {
    expect(isPubliclyReachable('not a url')).toBe(false)
  })
})

describe('a development machine', () => {
  /**
   * The check has to stay invisible locally. `next build` and `next start` both
   * set NODE_ENV=production, and the Playwright suite runs against a production
   * build with RESEND_API_KEY deliberately empty — so keying off NODE_ENV would
   * have broken every flow.
   */
  it('is never refused, however little is configured', () => {
    expect(deploymentProblems(local, { serverless: false })).toEqual([])
    expect(deploymentProblems(local, { serverless: true })).toEqual([])
  })

  it('is not warned at either', () => {
    expect(deploymentWarnings(local, { serverless: false })).toEqual([])
  })
})

describe('a public deployment', () => {
  it('starts when everything is set', () => {
    expect(deploymentProblems(configured, { serverless: true })).toEqual([])
  })

  it('is refused when the mail key is missing, because sign-up would strand everybody', () => {
    const problems = deploymentProblems(
      { ...configured, RESEND_API_KEY: undefined },
      { serverless: true },
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('RESEND_API_KEY')
    expect(problems[0]).toContain('signing up')
  })

  it('is refused when no cron secret is set, because no digest would ever run', () => {
    const problems = deploymentProblems(
      { ...configured, CRON_SECRET: undefined },
      { serverless: true },
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('CRON_SECRET')
  })

  it('is refused when the sender is still the placeholder', () => {
    const problems = deploymentProblems(
      { ...configured, EMAIL_FROM: 'Storyboard <hello@example.com>' },
      { serverless: true },
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('EMAIL_FROM')
  })

  it.each([
    ['NEXT_PUBLIC_APP_URL', { NEXT_PUBLIC_APP_URL: 'http://app.storyboard.example' }],
    ['NEXT_PUBLIC_MARKETING_URL', { NEXT_PUBLIC_MARKETING_URL: 'http://storyboard.example' }],
  ])('is refused when %s is not https', (name, override) => {
    const problems = deploymentProblems({ ...configured, ...override }, { serverless: true })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain(name)
  })

  it('reports every problem at once rather than one per deploy', () => {
    const problems = deploymentProblems(
      { ...local, NEXT_PUBLIC_APP_URL: 'http://app.storyboard.example' },
      { serverless: true },
    )
    // Mail key, placeholder sender, cron secret, two non-https URLs, and R2.
    expect(problems).toHaveLength(6)
  })
})

describe('object storage', () => {
  const withoutR2 = {
    ...configured,
    R2_ACCOUNT_ID: undefined,
    R2_ACCESS_KEY_ID: undefined,
    R2_SECRET_ACCESS_KEY: undefined,
    R2_BUCKET: undefined,
  }

  it('refuses a serverless host without it: the upload lands on a machine that goes away', () => {
    const problems = deploymentProblems(withoutR2, { serverless: true })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('R2_')
  })

  it('allows a self-hosted box without it, and says what it is doing instead', () => {
    expect(deploymentProblems(withoutR2, { serverless: false })).toEqual([])
    const warnings = deploymentWarnings(withoutR2, { serverless: false })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('.uploads/')
  })

  it('does not warn twice when it has already refused', () => {
    expect(deploymentWarnings(withoutR2, { serverless: true })).toEqual([])
  })

  it('needs all four, not three', () => {
    const problems = deploymentProblems(
      { ...configured, R2_BUCKET: undefined },
      { serverless: true },
    )
    expect(problems).toHaveLength(1)
  })
})

describe('the report', () => {
  it('names the escape hatch, so nobody has to read this file to find it', () => {
    const report = preflightReport(['CRON_SECRET is not set.'])
    expect(report).toContain('ALLOW_INCOMPLETE_DEPLOYMENT=1')
    expect(report).toContain('docs/05-deployment.md')
  })

  it('counts in English', () => {
    expect(preflightReport(['one'])).toContain('1 thing is not configured')
    expect(preflightReport(['one', 'two'])).toContain('2 things are not configured')
  })
})
