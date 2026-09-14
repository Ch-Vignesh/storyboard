import { describe, expect, it } from 'vitest'

import { cn } from './cn'

describe('cn', () => {
  it('joins truthy class names and drops falsy ones', () => {
    expect(cn('a', false, undefined, 'b', null, 0, 'c')).toBe('a b c')
  })

  it('lets the later of two conflicting Tailwind utilities win', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4')
  })

  it('supports object and array syntax', () => {
    expect(cn(['a', { b: true, c: false }])).toBe('a b')
  })
})
