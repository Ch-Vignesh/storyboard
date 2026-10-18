import { strToU8, unzipSync, zipSync } from 'fflate'

/**
 * The zip writer the `.epub` exporter uses, with a plainer face for anything
 * else that is "some files in one download" — phase 14, item 3.14's account
 * export. Text goes in as UTF-8; everything is deflated; `mtime` is fixed by
 * the caller so the same content zips to the same bytes.
 */
export function zipFiles(files: Record<string, string | Uint8Array>, mtime: Date): Buffer {
  const entries: Record<string, [Uint8Array, { level: 6; mtime: Date }]> = {}
  for (const [name, data] of Object.entries(files)) {
    entries[name] = [typeof data === 'string' ? strToU8(data) : data, { level: 6, mtime }]
  }
  return Buffer.from(zipSync(entries, { mtime }))
}

/** The reverse, for tests that want to look inside what was written. */
export function unzipFiles(zip: Uint8Array): Record<string, Uint8Array> {
  return unzipSync(zip)
}
