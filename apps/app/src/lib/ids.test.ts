import { describe, expect, it } from 'vitest'

import { publicId, slugify } from './ids'

describe('publicId', () => {
  it('is 10 lowercase URL-safe characters', () => {
    expect(publicId()).toMatch(/^[0-9a-z]{10}$/)
    expect(publicId()).not.toBe(publicId())
  })
})

describe('slugify', () => {
  it('turns a title into a URL slug', () => {
    expect(slugify('The Ship Never Lands')).toBe('the-ship-never-lands')
  })

  it('strips accents and punctuation', () => {
    expect(slugify("Cafe Nunez: 'A Story'")).toBe('cafe-nunez-a-story')
    expect(slugify('  --  Hello!!  --  ')).toBe('hello')
  })

  it('falls back when nothing usable remains', () => {
    expect(slugify('???')).toBe('untitled')
  })

  it('caps length without leaving a trailing hyphen', () => {
    const slug = slugify('word '.repeat(40))
    expect(slug.length).toBeLessThanOrEqual(60)
    expect(slug.endsWith('-')).toBe(false)
  })
})
