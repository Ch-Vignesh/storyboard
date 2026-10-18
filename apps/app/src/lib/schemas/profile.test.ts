import { describe, expect, it } from 'vitest'

import { bioSchema, displayNameSchema, posesAsSomeoneElse } from './profile'

/** Phase 14, item 3.8 — a display name cannot pose as someone else, or hide characters. */
describe('displayNameSchema', () => {
  it('trims, collapses inner whitespace and strips what is not writing', () => {
    expect(displayNameSchema.parse('  Ada   Lovelace ')).toBe('Ada Lovelace')
    // A right-to-left override and a zero-width joiner, both gone.
    expect(displayNameSchema.parse('Ada‮Love‍lace')).toBe('AdaLovelace')
    expect(displayNameSchema.parse('Ada\u0007 Lovelace')).toBe('Ada Lovelace')
  })

  it('refuses a name that reads as nobody, as the place, or as a reserved username', () => {
    for (const posing of [
      'a former member',
      'A FORMER MEMBER',
      'Draftboard',
      'draftboard examples',
      'admin',
      'Moderator',
    ]) {
      expect(displayNameSchema.safeParse(posing).success, posing).toBe(false)
      expect(posesAsSomeoneElse(posing)).toBe(true)
    }
    expect(displayNameSchema.safeParse('Ada Lovelace').success).toBe(true)
    expect(displayNameSchema.safeParse('').success).toBe(false)
    expect(displayNameSchema.safeParse('x'.repeat(81)).success).toBe(false)
  })
})

describe('bioSchema', () => {
  it('keeps line breaks, strips the rest of the unwritable, and bounds the length', () => {
    expect(bioSchema.parse('Writes at night.\nReads at dawn.​')).toBe(
      'Writes at night.\nReads at dawn.',
    )
    expect(bioSchema.safeParse('x'.repeat(281)).success).toBe(false)
    expect(bioSchema.parse(' ​ ')).toBeNull()
  })
})
