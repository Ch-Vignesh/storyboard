import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { AVATAR } from '@/lib/schemas/constants'

import { NotAnImage, shrinkAvatar } from './avatars'

/** Phase 14, item 3.13 — a large photo comes out as a small square icon. */
describe('shrinkAvatar', () => {
  it('turns a large PNG into a square WebP of the icon size, under the byte bound', async () => {
    // A noisy picture rather than a flat one: flat colour compresses to
    // nothing and would prove little about the bound.
    const noise = Buffer.alloc(2400 * 1600 * 3)
    for (let index = 0; index < noise.length; index += 1) noise[index] = (index * 2654435761) % 251
    const large = await sharp(noise, { raw: { width: 2400, height: 1600, channels: 3 } })
      .png()
      .toBuffer()
    expect(large.length).toBeGreaterThan(AVATAR.maxStoredBytes)

    const { bytes, contentType } = await shrinkAvatar(large)
    const meta = await sharp(bytes).metadata()

    expect(contentType).toBe('image/webp')
    expect(meta.format).toBe('webp')
    expect([meta.width, meta.height]).toEqual([AVATAR.sizePx, AVATAR.sizePx])
    expect(bytes.length).toBeLessThanOrEqual(AVATAR.maxStoredBytes)
  })

  it('is stable: shrinking the stored form again stays the same size and kind', async () => {
    const small = await sharp({
      create: { width: 300, height: 500, channels: 3, background: { r: 120, g: 80, b: 40 } },
    })
      .jpeg()
      .toBuffer()
    const once = await shrinkAvatar(small)
    const twice = await shrinkAvatar(once.bytes)
    const meta = await sharp(twice.bytes).metadata()
    expect([meta.width, meta.height, meta.format]).toEqual([AVATAR.sizePx, AVATAR.sizePx, 'webp'])
    expect(twice.bytes.length).toBeLessThanOrEqual(AVATAR.maxStoredBytes)
  })

  it('refuses what is not a readable JPEG, PNG or WebP', async () => {
    await expect(
      shrinkAvatar(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
    ).rejects.toThrow(NotAnImage)
    await expect(shrinkAvatar(Buffer.from('just some text'))).rejects.toThrow(NotAnImage)
    // A GIF is an image, but not one of the three kinds accepted.
    const gif = await sharp({
      create: { width: 4, height: 4, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .gif()
      .toBuffer()
    await expect(shrinkAvatar(gif)).rejects.toThrow(NotAnImage)
  })
})
