import { VERIFICATION_TOKEN_TTL_HOURS } from '@/lib/schemas/constants'

import type { Mail } from '../mailer'

/** FR-1.4 — how long the link works, said from the constant that enforces it. */
const WORKS_FOR = `The link works for ${String(VERIFICATION_TOKEN_TTL_HOURS)} hours. If you did not sign up, you can ignore this email.`

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** FR-1.3 step one. Plain and single-column by design (FR-12.5). */
export function verifyEmailMail(input: { to: string; url: string }): Mail {
  const text = [
    'Confirm your email address to finish creating your Draftboard account:',
    '',
    input.url,
    '',
    WORKS_FOR,
  ].join('\n')

  const url = escapeHtml(input.url)
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:32px 16px;background:#fbfbf9;color:#11202b;font-family:system-ui,sans-serif;font-size:16px;line-height:1.5">
    <div style="max-width:520px;margin:0 auto">
      <p style="margin:0 0 16px">Confirm your email address to finish creating your Draftboard account.</p>
      <p style="margin:0 0 24px"><a href="${url}" style="color:#2b5ca8">Confirm my email</a></p>
      <p style="margin:0 0 8px;color:#55636d;font-size:14px">Or paste this link into your browser:</p>
      <p style="margin:0 0 24px;word-break:break-all;color:#55636d;font-size:14px">${url}</p>
      <p style="margin:0;color:#8a949c;font-size:13px">${escapeHtml(WORKS_FOR)}</p>
    </div>
  </body>
</html>`

  return { to: input.to, subject: 'Confirm your email for Draftboard', text, html }
}
