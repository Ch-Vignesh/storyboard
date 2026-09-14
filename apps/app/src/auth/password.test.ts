import { describe, expect, it } from 'vitest'

import { hashPassword, verifyPassword } from './password'

describe('password hashing', () => {
  it('round-trips a password through argon2id', async () => {
    const encoded = await hashPassword('correct horse battery staple')
    expect(encoded.startsWith('$argon2id$')).toBe(true)
    await expect(verifyPassword(encoded, 'correct horse battery staple')).resolves.toBe(true)
  })

  it('rejects a wrong password', async () => {
    const encoded = await hashPassword('correct horse battery staple')
    await expect(verifyPassword(encoded, 'incorrect horse')).resolves.toBe(false)
  })

  it('returns false instead of throwing on garbage input', async () => {
    await expect(verifyPassword('not-a-hash', 'anything')).resolves.toBe(false)
    await expect(verifyPassword('', 'anything')).resolves.toBe(false)
  })

  it('salts, so equal passwords hash differently', async () => {
    const [a, b] = await Promise.all([hashPassword('same'), hashPassword('same')])
    expect(a).not.toBe(b)
  })
})
