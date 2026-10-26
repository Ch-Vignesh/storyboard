import { Inflate, unzipSync } from 'fflate'

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
  constructor(declared: number | null) {
    super(
      declared === null
        ? 'That file is put together in a way a manuscript is not, so it was not opened.'
        : `That file says it holds ${String(Math.round(declared / 1024 / 1024))} MB inside a much smaller archive, which is not what a manuscript looks like.`,
    )
    this.name = 'SuspiciousArchiveError'
  }
}

const LOCAL_HEADER = 0x04034b50
const CENTRAL_HEADER = 0x02014b50
const END_OF_DIRECTORY = 0x06054b50

type Member = { method: number; compressedSize: number; dataStart: number }

/**
 * The members as JSZip, which `mammoth` uses, reads them: the method and the
 * compressed size from the central directory, and the data where the local
 * header says it starts. Null when there is no directory to read, which JSZip
 * cannot open either.
 */
function membersAsJsZipReadsThem(file: Buffer): Member[] | null {
  const floor = Math.max(0, file.length - 22 - 0xffff)
  let end = -1
  for (let at = file.length - 22; at >= floor; at -= 1) {
    if (file.readUInt32LE(at) === END_OF_DIRECTORY) {
      end = at
      break
    }
  }
  if (end < 0) return null

  const count = file.readUInt16LE(end + 10)
  const directoryAt = file.readUInt32LE(end + 16)
  // ZIP64, which no manuscript needs and whose sizes this does not read.
  if (count === 0xffff || directoryAt === 0xffffffff) throw new SuspiciousArchiveError(null)

  const members: Member[] = []
  let at = directoryAt
  for (let index = 0; index < count; index += 1) {
    if (at + 46 > file.length || file.readUInt32LE(at) !== CENTRAL_HEADER) return null
    const localAt = file.readUInt32LE(at + 42)
    if (localAt + 30 > file.length || file.readUInt32LE(localAt) !== LOCAL_HEADER) return null
    members.push({
      method: file.readUInt16LE(at + 10),
      compressedSize: file.readUInt32LE(at + 20),
      dataStart: localAt + 30 + file.readUInt16LE(localAt + 26) + file.readUInt16LE(localAt + 28),
    })
    at += 46 + file.readUInt16LE(at + 28) + file.readUInt16LE(at + 30) + file.readUInt16LE(at + 32)
  }
  return members
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
 * inflated here, counted and dropped, stopping at the cap.
 *
 * Inflated as JSZip will inflate it, from the central directory: the guard
 * read the local headers, and an archive whose two headers disagree passed
 * it, then inflated in full inside `mammoth` (2026-10-26 final pass, the
 * detective review). A member this cannot inflate is refused rather than
 * waved through, since the library after it might manage more of it.
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

  const members = membersAsJsZipReadsThem(file)
  if (!members) return

  let actual = 0
  const count = (bytes: number) => {
    actual += bytes
    if (actual > MAX_UNCOMPRESSED_BYTES) throw new SuspiciousArchiveError(actual)
  }
  for (const member of members) {
    const data = file.subarray(member.dataStart, member.dataStart + member.compressedSize)
    if (member.method === 0) {
      count(data.length)
    } else if (member.method === 8) {
      try {
        const inflater = new Inflate((chunk) => count(chunk.length))
        inflater.push(new Uint8Array(data), true)
      } catch (error) {
        if (error instanceof SuspiciousArchiveError) throw error
        throw new SuspiciousArchiveError(null)
      }
    }
    // Any other method JSZip cannot read either, and `mammoth` will say so.
  }
}
