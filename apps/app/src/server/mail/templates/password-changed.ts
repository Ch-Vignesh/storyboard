import type { Mail } from '../mailer'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/**
 * FR-1.7 — after a reset, to the address it was done for.
 *
 * The person who reset it already knows. This is for the case where it was not
 * them: whoever opened the link held the inbox, and the owner should hear about
 * it from somewhere other than finding themselves signed out.
 */
export function passwordChangedMail(input: { to: string; forgotUrl: string }): Mail {
  const text = [
    'The password of your Draftboard account was just changed, and every device that was signed in has been signed out.',
    '',
    'If that was you, there is nothing to do.',
    '',
    'If it was not, somebody has been able to read this inbox. Secure your email account first, then reset your Draftboard password here:',
    input.forgotUrl,
  ].join('\n')

  const url = escapeHtml(input.forgotUrl)
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:32px 16px;background:#fbfbf9;color:#11202b;font-family:system-ui,sans-serif;font-size:16px;line-height:1.5">
    <div style="max-width:520px;margin:0 auto">
      <p style="margin:0 0 16px">The password of your Draftboard account was just changed, and every device that was signed in has been signed out.</p>
      <p style="margin:0 0 16px">If that was you, there is nothing to do.</p>
      <p style="margin:0 0 16px">If it was not, somebody has been able to read this inbox. Secure your email account first, then reset your Draftboard password.</p>
      <p style="margin:0"><a href="${url}" style="color:#2b5ca8">Reset my password</a></p>
    </div>
  </body>
</html>`

  return { to: input.to, subject: 'Your Draftboard password was changed', text, html }
}
