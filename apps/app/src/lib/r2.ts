/**
 * How this application talks to Cloudflare R2, in the one place every caller
 * reads it from: the storage module that signs uploads, the Content-Security-
 * Policy that lets the browser send them, and the deploy doctor that checks
 * both. No SDK import here, so the edge proxy can use it.
 */

/** The account's S3 endpoint. Every R2 URL this application makes is on this origin. */
export function r2Endpoint(accountId: string): string {
  return `https://${accountId}.r2.cloudflarestorage.com`
}

/**
 * Path-style, so a presigned URL is `<endpoint>/<bucket>/<key>`.
 *
 * The SDK's default puts the bucket in the hostname instead,
 * `<bucket>.<account>.r2.cloudflarestorage.com`, which is a different origin
 * from the endpoint. The policy's `connect-src` named the endpoint, so the
 * browser refused every upload before it left the machine, and the import
 * screen said only "Failed to fetch" (2026-10-15, the first import on
 * production). Path-style keeps every URL on the one origin the policy names,
 * and the policy never has to know the bucket's name.
 */
export const R2_CLIENT_OPTIONS = { region: 'auto', forcePathStyle: true } as const
