import { Unzip, UnzipInflate, UnzipPassThrough, unzipSync } from 'fflate'

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
 * Throws when the archive declares, or actually holds, more than the cap.
 * Returns nothing: this is a gate, and the caller reads the file the ordinary
 * way afterwards.
 *
 * Two readings. The directory's declared sizes are free and catch an honest
 * giant. But they are written by whoever made the archive, so a member can
 * declare a kilobyte and inflate to gigabytes, and the libraries after this
 * one inflate first and notice later (phase 12 audit). So every member is also
 * inflated here, as a stream, counted, and dropped: nothing is kept, and it
 * stops at the cap rather than at the end.
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

  let actual = 0
  const unzip = new Unzip((entry) => {
    entry.ondata = (error, chunk) => {
      if (error) throw error
      actual += chunk.length
      if (actual > MAX_UNCOMPRESSED_BYTES) throw new SuspiciousArchiveError(actual)
    }
    entry.start()
  })
  unzip.register(UnzipInflate)
  unzip.register(UnzipPassThrough)
  try {
    unzip.push(new Uint8Array(file), true)
  } catch (error) {
    if (error instanceof SuspiciousArchiveError) throw error
    // Damaged rather than dangerous; `mammoth` will say so in its own words.
  }
}
