/**
 * The upload URL a browser is sent, and the policy that has to let it through.
 *
 * Each was right on its own on 2026-10-15, and every import on production
 * failed: the SDK put the bucket in the hostname, the policy named the
 * endpoint, and the browser refused the upload as a different origin. Neither
 * half had a test that looked at the other. This one signs a real URL — offline,
 * with made-up credentials — and asks the real policy about it.
 */
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { describe, expect, it } from 'vitest'

import { contentSecurityPolicy, withObjectStore } from './csp'
import { R2_CLIENT_OPTIONS, r2Endpoint } from './r2'

const ACCOUNT = '0123456789abcdef0123456789abcdef'
const credentials = { accessKeyId: 'test-key', secretAccessKey: 'test-secret' }

async function signedUpload(options: object): Promise<URL> {
  const client = new S3Client({ ...options, endpoint: r2Endpoint(ACCOUNT), credentials })
  const url = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: 'draftboard-uploads',
      Key: 'imports/user/abc/novel.docx',
      ContentType: 'application/octet-stream',
    }),
    { expiresIn: 60 },
  )
  return new URL(url)
}

function connectSources(): string[] {
  const policy = withObjectStore(contentSecurityPolicy('nonce', { isDev: false }), ACCOUNT)
  const directive = policy.split(';').find((part) => part.trim().startsWith('connect-src'))
  return directive?.trim().split(/\s+/u).slice(1) ?? []
}

describe('a browser upload to R2 (FR-3.1)', () => {
  it('is signed for the endpoint itself, with the bucket in the path', async () => {
    const url = await signedUpload(R2_CLIENT_OPTIONS)
    expect(url.origin).toBe(r2Endpoint(ACCOUNT))
    expect(url.pathname.startsWith('/draftboard-uploads/')).toBe(true)
  })

  it('goes to an origin the policy lets the browser connect to', async () => {
    const url = await signedUpload(R2_CLIENT_OPTIONS)
    expect(connectSources()).toContain(url.origin)
  })

  it('would not, signed the way the SDK does by default — the failure on production', async () => {
    const url = await signedUpload({ region: 'auto' })
    expect(url.host).toBe(`draftboard-uploads.${ACCOUNT}.r2.cloudflarestorage.com`)
    expect(connectSources()).not.toContain(url.origin)
  })
})
