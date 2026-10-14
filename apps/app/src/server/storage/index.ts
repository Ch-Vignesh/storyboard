import 'server-only'

import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'

// Types only: erased at build, so the SDK itself still loads on first use.
import type * as S3 from '@aws-sdk/client-s3'
import type { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { env } from '@/env'
import { logger } from '@/lib/logger'
import { R2_CLIENT_OPTIONS, r2Endpoint } from '@/lib/r2'

const log = logger.child({ module: 'storage' })

/**
 * Where an uploaded manuscript lives between the browser and the parser.
 *
 * Two drivers behind one interface. R2 in production, via a presigned PUT so a
 * 5 MB file never travels through the application server (FR-3.1). A directory
 * on disk in development, because a contributor cloning the repository should
 * be able to run an import without a Cloudflare account — and because every
 * exit criterion in this phase has to be checkable on a laptop.
 *
 * The driver is chosen by configuration, not by `NODE_ENV`: a self-hosted
 * deployment with no object store is a legitimate way to run this, and it
 * should not have to lie about its environment to do so.
 */

/** Uploads live an hour. Long enough to choose a file, short enough to matter. */
const UPLOAD_TTL_SECONDS = 60 * 60

/** Where the local driver writes. Outside `public/`: these are not web assets. */
const LOCAL_ROOT = resolve(process.cwd(), '.uploads')

export type UploadTarget = {
  /** Where the browser PUTs the file. */
  url: string
  /** What the server calls it afterwards. */
  key: string
  /** Extra headers the PUT must carry, if any. */
  headers: Record<string, string>
  /** True when the browser uploads straight to the object store. */
  direct: boolean
}

function r2Configured(): boolean {
  return Boolean(
    env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET,
  )
}

type R2 = {
  sdk: typeof S3
  client: S3.S3Client
  presign: typeof getSignedUrl
}

/**
 * The AWS SDK, loaded on first use. It is megabytes of JavaScript, and this
 * module sits under the tRPC router, so a top-level import made every cold
 * start load it for the rare request that touches an upload (phase 10).
 */
let r2Loading: Promise<R2> | null = null
function r2(): Promise<R2> {
  r2Loading ??= (async () => {
    const [sdk, presigner] = await Promise.all([
      import('@aws-sdk/client-s3'),
      import('@aws-sdk/s3-request-presigner'),
    ])
    const client = new sdk.S3Client({
      ...R2_CLIENT_OPTIONS,
      endpoint: r2Endpoint(String(env.R2_ACCOUNT_ID)),
      credentials: {
        accessKeyId: String(env.R2_ACCESS_KEY_ID),
        secretAccessKey: String(env.R2_SECRET_ACCESS_KEY),
      },
    })
    return { sdk, client, presign: presigner.getSignedUrl }
  })()
  return r2Loading
}

/**
 * A key nobody can guess.
 *
 * The user id is in the path so a stray object can be traced to an account, and
 * the random half is what actually protects it: a presigned URL is the only way
 * in, but a predictable key would make a misconfigured bucket a disaster rather
 * than a mistake.
 */
export function uploadKey(userId: string, fileName: string): string {
  const safeName = fileName
    .replaceAll(/[^\w.-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(-80)
  return `imports/${userId}/${randomBytes(16).toString('hex')}/${safeName || 'manuscript'}`
}

/** Refuses a key that tries to climb out of the uploads directory. */
function localPath(key: string): string {
  const full = resolve(LOCAL_ROOT, key)
  if (full !== LOCAL_ROOT && !full.startsWith(LOCAL_ROOT + sep)) {
    throw new Error('That upload key is not valid.')
  }
  return full
}

/** Where the browser should PUT the file (FR-3.1). */
export async function createUploadTarget(key: string, contentType: string): Promise<UploadTarget> {
  if (r2Configured()) {
    const { sdk, client, presign } = await r2()
    const url = await presign(
      client,
      new sdk.PutObjectCommand({
        Bucket: String(env.R2_BUCKET),
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: UPLOAD_TTL_SECONDS },
    )
    return { url, key, headers: { 'content-type': contentType }, direct: true }
  }

  // No object store configured: the application takes the bytes itself.
  return {
    url: `${env.NEXT_PUBLIC_APP_URL}/api/import/upload?key=${encodeURIComponent(key)}`,
    key,
    headers: { 'content-type': contentType },
    direct: false,
  }
}

export async function putObject(key: string, body: Buffer): Promise<void> {
  if (r2Configured()) {
    const { sdk, client } = await r2()
    await client.send(
      new sdk.PutObjectCommand({ Bucket: String(env.R2_BUCKET), Key: key, Body: body }),
    )
    return
  }
  const path = localPath(key)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, body)
}

export async function getObject(key: string): Promise<Buffer> {
  if (r2Configured()) {
    const { sdk, client } = await r2()
    const result = await client.send(
      new sdk.GetObjectCommand({ Bucket: String(env.R2_BUCKET), Key: key }),
    )
    const bytes = await result.Body?.transformToByteArray()
    if (!bytes) throw new Error('That upload could not be read.')
    return Buffer.from(bytes)
  }
  return readFile(localPath(key))
}

/**
 * Deletes an upload. Called once the proposal is committed or abandoned: the
 * file has served its purpose and keeping somebody's whole manuscript around
 * afterwards is storage nobody asked for.
 *
 * Never throws, because every caller has finished its real work by the time it
 * gets here — an import that committed must not fail on its cleanup. Returns
 * false when the store refused or could not be reached, so a caller that keeps
 * a pointer to the file can keep it and try again. A file that was already gone
 * counts as deleted: R2 and `rm --force` both say so without an error.
 */
export async function deleteObject(key: string): Promise<boolean> {
  try {
    if (r2Configured()) {
      const { sdk, client } = await r2()
      await client.send(new sdk.DeleteObjectCommand({ Bucket: String(env.R2_BUCKET), Key: key }))
      return true
    }
    await rm(localPath(key), { force: true })
    return true
  } catch (error) {
    // The directory, which is unique, and not the file name, which can say
    // whose manuscript it is — this runs during an account erasure too.
    const where = key.slice(0, key.lastIndexOf('/') + 1)
    log.warn({ event: 'storage.delete.failed', where, error: String(error) }, 'upload not deleted')
    return false
  }
}

/** True when uploads go straight to an object store. The UI says nothing about it. */
export function usingObjectStore(): boolean {
  return r2Configured()
}

/** Exported for the upload route, which needs to know where it may write. */
export const LOCAL_UPLOAD_ROOT = LOCAL_ROOT
export { join as joinPath }
