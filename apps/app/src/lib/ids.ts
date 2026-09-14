import { customAlphabet } from 'nanoid'

/** URL-safe, lowercase, unambiguous: fine inside a slug and easy to read aloud. */
export const publicId = customAlphabet('0123456789abcdefghijkmnpqrstuvwxyz', 10)

/** `The Ship Never Lands` -> `the-ship-never-lands`. Falls back to `untitled`. */
export function slugify(input: string): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
  return slug.length > 0 ? slug : 'untitled'
}
