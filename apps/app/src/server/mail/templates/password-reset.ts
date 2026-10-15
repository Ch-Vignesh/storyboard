import { RESET_LINK_LIFETIME as lifetime } from '@/lib/password-reset'

import type { Mail } from '../mailer'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** FR-1.7 — the link to choose a new password. Plain and single-column (FR-12.5). */
export function passwordResetMail(input: { to: string; url: string }): Mail {
  const text = [
    'Somebody, probably you, asked to reset the password of your Draftboard account. Choose a new one here:',
    '',
    input.url,
    '',
    `The link works for ${lifetime}, once. If you did not ask, you can ignore this email: your password has not changed.`,
  ].join('\n')

  const url = escapeHtml(input.url)
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:32px 16px;background:#fbfbf9;color:#11202b;font-family:system-ui,sans-serif;font-size:16px;line-height:1.5">
    <div style="max-width:520px;margin:0 auto">
      <p style="margin:0 0 16px">Somebody, probably you, asked to reset the password of your Draftboard account.</p>
      <p style="margin:0 0 24px"><a href="${url}" style="color:#2b5ca8">Choose a new password</a></p>
      <p style="margin:0 0 8px;color:#55636d;font-size:14px">Or paste this link into your browser:</p>
      <p style="margin:0 0 24px;word-break:break-all;color:#55636d;font-size:14px">${url}</p>
      <p style="margin:0;color:#8a949c;font-size:13px">The link works for ${lifetime}, once. If you did not ask, you can ignore this email: your password has not changed.</p>
    </div>
  </body>
</html>`

  return { to: input.to, subject: 'Reset your Draftboard password', text, html }
}
