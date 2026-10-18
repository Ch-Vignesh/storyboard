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
 * Phase 14, item 3.2 — to the new address: the link that makes it the
 * account's. Nothing changes until it is opened, which is what makes it safe
 * to send to an address somebody only typed.
 */
export function emailChangeMail(input: { to: string; url: string; lifetime: string }): Mail {
  const text = [
    'Somebody, probably you, asked to make this the email address of their Draftboard account.',
    '',
    'If that was you, confirm it here:',
    input.url,
    '',
    `The link works for ${input.lifetime} and once. If it was not you, ignore this email: nothing changes without the link.`,
  ].join('\n')

  const url = escapeHtml(input.url)
  const html = `<!doctype html>
<html lang="en">
  <body style="${BODY_STYLE}">
    <div style="max-width:520px;margin:0 auto">
      <p style="margin:0 0 16px">Somebody, probably you, asked to make this the email address of their Draftboard account.</p>
      <p style="margin:0 0 16px"><a href="${url}" style="color:#2b5ca8">Make this my address</a></p>
      <p style="margin:0;color:#55636d">The link works for ${escapeHtml(input.lifetime)} and once. If it was not you, ignore this email: nothing changes without the link.</p>
    </div>
  </body>
</html>`

  return { to: input.to, subject: 'Confirm this address for your Draftboard account', text, html }
}

/**
 * To the old address, once the change has happened: the one place its owner
 * can learn of it. The new address is shown in part, so this note, which may
 * sit in a mailbox somebody else has got into, gives the other one away.
 */
export function emailChangedNoticeMail(input: {
  to: string
  newEmailMasked: string
  supportAddress: string
}): Mail {
  const text = [
    `The email address of your Draftboard account was changed to ${input.newEmailMasked}. Every device was signed out.`,
    '',
    `If that was you, there is nothing to do. If it was not, write to ${input.supportAddress} straight away, from this address.`,
  ].join('\n')

  const support = escapeHtml(input.supportAddress)
  const html = `<!doctype html>
<html lang="en">
  <body style="${BODY_STYLE}">
    <div style="max-width:520px;margin:0 auto">
      <p style="margin:0 0 16px">The email address of your Draftboard account was changed to <strong>${escapeHtml(input.newEmailMasked)}</strong>. Every device was signed out.</p>
      <p style="margin:0;color:#55636d">If that was you, there is nothing to do. If it was not, write to <a href="mailto:${support}" style="color:#2b5ca8">${support}</a> straight away, from this address.</p>
    </div>
  </body>
</html>`

  return {
    to: input.to,
    subject: 'The email address of your Draftboard account was changed',
    text,
    html,
  }
}
