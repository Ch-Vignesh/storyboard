import sharp from 'sharp'

import { AVATAR } from '@/lib/schemas/constants'

/** The upload is not a JPEG, PNG or WebP that can be read. */
export class NotAnImage extends Error {
  constructor() {
    super('That file is not a picture this can read. Use a JPEG, PNG or WebP.')
    this.name = 'NotAnImage'
  }
}

/** The formats `sharp` reports for the three kinds accepted (D-5). */
const READABLE = new Set(['jpeg', 'png', 'webp'])

/**
 * Phase 14, item 3.13 (D-5) — the stored form of a profile picture.
 *
 * The bytes are read as an image, whatever the upload called itself; a file
 * that is not one of the three kinds is refused. The picture is turned the
 * way its EXIF says (phones), cut to a centred square and shrunk to
 * `AVATAR.sizePx` a side as WebP — an icon, a few kilobytes, which is all it
 * is ever drawn as. Running the result through again changes nothing, which
 * is what lets the procedure that stores it do its own check.
 */
export async function shrinkAvatar(
  input: Buffer | Uint8Array,
): Promise<{ bytes: Buffer; contentType: 'image/webp' }> {
  // Enough pixels for any phone photo; a decompression bomb stops here.
  const image = sharp(input, { limitInputPixels: 50_000_000, animated: false })
  let format: string | undefined
  try {
    format = (await image.metadata()).format
  } catch {
    throw new NotAnImage()
  }
  if (!format || !READABLE.has(format)) throw new NotAnImage()

  const bytes = await image
    .rotate()
    .resize(AVATAR.sizePx, AVATAR.sizePx, { fit: 'cover', withoutEnlargement: false })
    .webp({ quality: 82, effort: 4 })
    .toBuffer()
  return { bytes, contentType: 'image/webp' }
}
