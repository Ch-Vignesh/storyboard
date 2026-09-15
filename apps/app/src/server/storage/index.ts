import 'server-only'

import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { env } from '@/env'

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

let client: S3Client | null = null
function s3(): S3Client {
  client ??= new S3Client({
    region: 'auto',
    endpoint: `https://${String(env.R2_ACCOUNT_ID)}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: String(env.R2_ACCESS_KEY_ID),
      secretAccessKey: String(env.R2_SECRET_ACCESS_KEY),
    },
  })
  return client
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
    const url = await getSignedUrl(
      s3(),
      new PutObjectCommand({
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
    await s3().send(new PutObjectCommand({ Bucket: String(env.R2_BUCKET), Key: key, Body: body }))
    return
  }
  const path = localPath(key)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, body)
}

export async function getObject(key: string): Promise<Buffer> {
  if (r2Configured()) {
    const result = await s3().send(
      new GetObjectCommand({ Bucket: String(env.R2_BUCKET), Key: key }),
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
 */
export async function deleteObject(key: string): Promise<void> {
  try {
    if (r2Configured()) {
      await s3().send(new DeleteObjectCommand({ Bucket: String(env.R2_BUCKET), Key: key }))
      return
    }
    await rm(localPath(key), { force: true })
  } catch {
    // A file that is already gone is the outcome we wanted.
  }
}

/** True when uploads go straight to an object store. The UI says nothing about it. */
export function usingObjectStore(): boolean {
  return r2Configured()
}

/** Exported for the upload route, which needs to know where it may write. */
export const LOCAL_UPLOAD_ROOT = LOCAL_ROOT
export { join as joinPath }
