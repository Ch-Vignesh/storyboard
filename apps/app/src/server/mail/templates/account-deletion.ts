import type { Mail } from '../mailer'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

const BODY_STYLE =
  'margin:0;padding:32px 16px;background:#fbfbf9;color:#11202b;font-family:system-ui,sans-serif;font-size:16px;line-height:1.5'

/**
 * Decision 0024 (phase 14, item 1.5) — sent the moment an account is scheduled
 * for deletion. The person who asked already knows. This is for the case where
 * it was not them: the request can be made from any session that is signed in
 * as them, and a week of grace protects nobody who never hears of it.
 */
export function deletionRequestedMail(input: {
  to: string
  finishesOn: string
  settingsUrl: string
}): Mail {
  const text = [
    `Your Draftboard account is set to be deleted on ${input.finishesOn}. Until then you can read, and nothing you write is kept.`,
    '',
    'If you asked for this, there is nothing to do.',
    '',
    'If you did not, somebody else is signed in as you. Sign in, choose Keep my account, and change your password:',
    input.settingsUrl,
    '',
    'Your stories, suggestions and credits stay either way, shown as a former member, as the deletion screen explains.',
  ].join('\n')

  const url = escapeHtml(input.settingsUrl)
  const html = `<!doctype html>
<html lang="en">
  <body style="${BODY_STYLE}">
    <div style="max-width:520px;margin:0 auto">
      <p style="margin:0 0 16px">Your Draftboard account is set to be deleted on <strong>${escapeHtml(input.finishesOn)}</strong>. Until then you can read, and nothing you write is kept.</p>
      <p style="margin:0 0 16px">If you asked for this, there is nothing to do.</p>
      <p style="margin:0 0 16px">If you did not, somebody else is signed in as you. Sign in, choose Keep my account, and change your password.</p>
      <p style="margin:0 0 16px"><a href="${url}" style="color:#2b5ca8">Keep my account</a></p>
      <p style="margin:0;color:#55636d">Your stories, suggestions and credits stay either way, shown as a former member, as the deletion screen explains.</p>
    </div>
  </body>
</html>`

  return {
    to: input.to,
    subject: `Your Draftboard account will be deleted on ${input.finishesOn}`,
    text,
    html,
  }
}

/** The last message. After it the address is no longer kept anywhere. */
export function accountDeletedMail(input: { to: string }): Mail {
  const text = [
    'Your Draftboard account has been deleted, as you asked. Everything that identified you is gone, and this address is no longer kept.',
    '',
    'The writing you left stays, shown as a former member.',
    '',
    'This is the last email you will get from Draftboard.',
  ].join('\n')

  const html = `<!doctype html>
<html lang="en">
  <body style="${BODY_STYLE}">
    <div style="max-width:520px;margin:0 auto">
      <p style="margin:0 0 16px">Your Draftboard account has been deleted, as you asked. Everything that identified you is gone, and this address is no longer kept.</p>
      <p style="margin:0 0 16px">The writing you left stays, shown as a former member.</p>
      <p style="margin:0;color:#55636d">This is the last email you will get from Draftboard.</p>
    </div>
  </body>
</html>`

  return { to: input.to, subject: 'Your Draftboard account has been deleted', text, html }
}

/**
 * Decision 0043 (phase 14, item 2b.5) — an administrator scheduled the
 * deletion. The account is closed at once, so "Keep my account" is not a way
 * back; the address to write to is. The administrator's note stays inside.
 */
export function deletionByAdminMail(input: {
  to: string
  finishesOn: string
  supportAddress: string
}): Mail {
  const text = [
    `Draftboard has closed your account, and it will be deleted on ${input.finishesOn}. Until then it cannot be signed in to.`,
    '',
    `If you think this is a mistake, write to ${input.supportAddress} before that day.`,
    '',
    'Your stories, suggestions and credits stay, shown as a former member.',
  ].join('\n')

  const address = escapeHtml(input.supportAddress)
  const html = `<!doctype html>
<html lang="en">
  <body style="${BODY_STYLE}">
    <div style="max-width:520px;margin:0 auto">
      <p style="margin:0 0 16px">Draftboard has closed your account, and it will be deleted on <strong>${escapeHtml(input.finishesOn)}</strong>. Until then it cannot be signed in to.</p>
      <p style="margin:0 0 16px">If you think this is a mistake, write to <a href="mailto:${address}" style="color:#2b5ca8">${address}</a> before that day.</p>
      <p style="margin:0;color:#55636d">Your stories, suggestions and credits stay, shown as a former member.</p>
    </div>
  </body>
</html>`

  return {
    to: input.to,
    subject: `Your Draftboard account will be deleted on ${input.finishesOn}`,
    text,
    html,
  }
}
