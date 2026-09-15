import { unzipSync } from 'fflate'

/**
 * What a `.docx` claims it will expand to, before anything expands it.
 *
 * A `.docx` is a zip, and a 5 MB zip can declare a 5 GB member. Nothing in the
 * FR-3.1 size limit stops that: the limit is on what arrives, not on what it
 * becomes. Reading the archive's own directory costs nothing and answers the
 * question before `mammoth` allocates anything.
 *
 * The cap is generous on purpose. A 300,000-word manuscript (FR-3.1's other
 * limit) is roughly 2 MB of text and perhaps 20 MB of Word's XML around it, so
 * 80 MB refuses only files that were never a manuscript.
 */
export const MAX_UNCOMPRESSED_BYTES = 80 * 1024 * 1024

export class SuspiciousArchiveError extends Error {
  constructor(declared: number) {
    super(
      `That file says it holds ${String(Math.round(declared / 1024 / 1024))} MB inside a much smaller archive, which is not what a manuscript looks like.`,
    )
    this.name = 'SuspiciousArchiveError'
  }
}

/**
 * Throws when the archive declares more than the cap. Returns nothing: this is
 * a gate, and the caller reads the file the ordinary way afterwards.
 */
export function assertReasonableArchive(file: Buffer): void {
  let declared = 0

  try {
    // The filter runs over the archive's directory and nothing is inflated when
    // it returns false, so this reads sizes without paying for the content.
    unzipSync(new Uint8Array(file), {
      filter: (entry) => {
        declared += entry.originalSize
        return false
      },
    })
  } catch {
    // Not a readable zip at all. `mammoth` will say so in its own words.
    return
  }

  if (declared > MAX_UNCOMPRESSED_BYTES) throw new SuspiciousArchiveError(declared)
}
