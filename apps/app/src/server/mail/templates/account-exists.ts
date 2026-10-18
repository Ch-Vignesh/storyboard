import type { Mail } from '../mailer'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/**
 * FR-1.3, for an address that already has an account.
 *
 * The sign-up form answers the same either way, so it never tells a stranger
 * whether an address is registered. This message is how the person who owns
 * the address still finds out what happened, in the one place only they can
 * read. Before it, they were told a link was on its way and nothing came.
 *
 * Item 3.4 — an account with no password signs in with Google, and was told
 * to sign in with a password it never had. Now it is pointed at Continue with
 * Google, and at the reset link if it would rather have a password.
 */
export function accountExistsMail(input: {
  to: string
  signInUrl: string
  forgotUrl: string
  googleOnly?: boolean
}): Mail {
  const text = [
    'Somebody, probably you, asked to sign up to Draftboard with this address. It already has an account, so nothing new was made.',
    '',
    ...(input.googleOnly
      ? [
          'That account signs in with Google. Press "Continue with Google" here:',
          input.signInUrl,
          '',
          'Would you rather have a password? Choose one here:',
          input.forgotUrl,
        ]
      : [
          'Sign in here:',
          input.signInUrl,
          '',
          'Forgotten the password? Choose a new one here:',
          input.forgotUrl,
        ]),
    '',
    'If it was not you, you can ignore this email. Nobody can sign in without your password, and nothing about your account has changed.',
  ].join('\n')

  const url = escapeHtml(input.signInUrl)
  const forgot = escapeHtml(input.forgotUrl)
  const way = input.googleOnly
    ? `<p style="margin:0 0 24px">That account signs in with Google: press <a href="${url}" style="color:#2b5ca8">Continue with Google</a>. Would you rather have a password? <a href="${forgot}" style="color:#2b5ca8">Choose one</a>.</p>`
    : `<p style="margin:0 0 24px"><a href="${url}" style="color:#2b5ca8">Sign in to Draftboard</a></p>
      <p style="margin:0 0 8px;color:#55636d;font-size:14px">Or paste this link into your browser:</p>
      <p style="margin:0 0 24px;word-break:break-all;color:#55636d;font-size:14px">${url}</p>
      <p style="margin:0 0 24px">Forgotten the password? <a href="${forgot}" style="color:#2b5ca8">Choose a new one</a>.</p>`
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:32px 16px;background:#fbfbf9;color:#11202b;font-family:system-ui,sans-serif;font-size:16px;line-height:1.5">
    <div style="max-width:520px;margin:0 auto">
      <p style="margin:0 0 16px">Somebody, probably you, asked to sign up to Draftboard with this address. It already has an account, so nothing new was made.</p>
      ${way}
      <p style="margin:0;color:#8a949c;font-size:13px">If it was not you, you can ignore this email. Nobody can sign in without your password, and nothing about your account has changed.</p>
    </div>
  </body>
</html>`

  return { to: input.to, subject: 'You already have a Draftboard account', text, html }
}
