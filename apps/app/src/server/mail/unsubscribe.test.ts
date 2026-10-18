import { createHmac } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

import { readUnsubscribe, signUnsubscribe } from './unsubscribe'

vi.mock('@/env', () => ({ env: { AUTH_SECRET: 'x'.repeat(32), NEXT_PUBLIC_APP_URL: 'http://t' } }))

/** FR-12.1 (phase 14, item 2.4) — the List-Unsubscribe token. */
describe('the unsubscribe token', () => {
  const secret = 'a-secret-of-at-least-thirty-two-characters'

  it('round-trips a person and the kinds of email', () => {
    const token = signUnsubscribe(
      { userId: 'user_1', types: ['SUGGESTION_RECEIVED', 'IDEA_RECEIVED'] },
      secret,
    )
    expect(token).toMatch(/^[\w-]+\.[\w-]+$/u)
    expect(readUnsubscribe(token, secret)).toEqual({
      userId: 'user_1',
      types: ['SUGGESTION_RECEIVED', 'IDEA_RECEIVED'],
    })
    expect(
      readUnsubscribe(signUnsubscribe({ userId: 'user_2', types: 'all' }, secret), secret),
    ).toEqual({ userId: 'user_2', types: 'all' })
  })

  it('refuses a token that was changed, signed with another secret, or never ours', () => {
    const token = signUnsubscribe({ userId: 'user_1', types: ['WEEKLY_DIGEST'] }, secret)
    const [payload, signature] = token.split('.') as [string, string]
    const forged = Buffer.from(JSON.stringify({ u: 'user_9', t: 'all' })).toString('base64url')
    expect(readUnsubscribe(`${forged}.${signature}`, secret)).toBeNull()
    expect(readUnsubscribe(`${payload}.${signature.slice(0, -1)}`, secret)).toBeNull()
    expect(readUnsubscribe(token, 'another-secret-of-thirty-two-chars!!')).toBeNull()
    expect(readUnsubscribe('', secret)).toBeNull()
    expect(readUnsubscribe('not.a.token', secret)).toBeNull()
    expect(readUnsubscribe('justonepart', secret)).toBeNull()
  })

  it('refuses a well-signed token naming a kind of email that does not exist', () => {
    const payload = Buffer.from(JSON.stringify({ u: 'user_1', t: ['NOT_A_TYPE'] })).toString(
      'base64url',
    )
    // Signed properly, as a future version of the code might sign something
    // this version cannot read.
    const signature = createHmac('sha256', secret).update(payload).digest('base64url')
    expect(readUnsubscribe(`${payload}.${signature}`, secret)).toBeNull()
  })
})
