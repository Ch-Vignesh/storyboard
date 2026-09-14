import { hash, verify } from '@node-rs/argon2'

/**
 * OWASP minimum for Argon2id: 19 MiB memory, 2 iterations, 1 lane.
 * Argon2id is the library default; password.test.ts asserts the `$argon2id$`
 * prefix so a silent default change would be caught.
 */
const ARGON2 = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2)
}

/** Returns false for a wrong password and for anything that is not a valid hash. */
export async function verifyPassword(encoded: string, plain: string): Promise<boolean> {
  try {
    return await verify(encoded, plain, ARGON2)
  } catch {
    return false
  }
}
