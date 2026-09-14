import { NOTIFICATIONS, type NotificationType } from '@/lib/schemas/notifications'

import type { Mail } from '../mailer'

/**
 * Notification emails (FR-12.5): plain, single-column, linking to a canonical
 * URL, and with no tracking pixels.
 *
 * Deliberately not React Email. The architecture suggests it for twelve
 * templates, but every one of these is a sentence, a link and a sign-off — the
 * whole HTML body is nine lines. A component library would be more code than
 * the thing it renders, and the plain-text half (which FR-12.5 says is what
 * these want to be anyway) would still be written by hand.
 */

export type NotificationLine = {
  type: NotificationType
  /** Where this notification points. Absolute. */
  url: string
  /** The specific thing, e.g. a request title. Optional; the type carries the rest. */
  subject?: string
}

const SHELL_STYLE =
  'font-family:Georgia,serif;font-size:16px;line-height:1.6;color:#11202b;max-width:34em;margin:0'

/**
 * A safe Subject line.
 *
 * A subject is an email *header*, and a header ends at a newline. Request
 * titles reach here, and a title may contain one — `.trim()` only strips the
 * ends — so a carriage return would let an author append headers of their own.
 * `Bcc:` is the useful one: it would turn the service into a relay that sends
 * to arbitrary addresses from a trusted domain.
 *
 * The title schema refuses control characters too, but this is the boundary
 * that has to hold regardless of what reaches it.
 */
function safeSubject(value: string): string {
  return (
    value
      // CR, LF, every other C0 control, and DEL. None belong in a header.
      // eslint-disable-next-line no-control-regex -- removing them is the point
      .replace(/[\u0000-\u001f\u007f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200)
  )
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** One message about one thing (FR-12.3's immediate class). */
export function notificationMail(options: {
  to: string
  line: NotificationLine
  appUrl: string
}): Mail {
  const definition = NOTIFICATIONS[options.line.type]
  const subject = options.line.subject
    ? safeSubject(`${definition.label}: ${options.line.subject}`)
    : definition.label

  const text = [
    definition.sentence,
    '',
    options.line.url,
    '',
    'Change what you are emailed about:',
    `${options.appUrl}/settings`,
  ].join('\n')

  const html = [
    `<div style="${SHELL_STYLE}">`,
    `<p>${escapeHtml(definition.sentence)}</p>`,
    `<p><a href="${options.line.url}">${escapeHtml(options.line.subject ?? 'Open it')}</a></p>`,
    `<p style="font-size:13px;color:#8a949c">`,
    `<a href="${options.appUrl}/settings" style="color:#8a949c">Change what you are emailed about</a>`,
    `</p>`,
    `</div>`,
  ].join('\n')

  return { to: options.to, subject, text, html }
}

/** Several things at once (FR-12.3's hourly and weekly classes). */
export function digestMail(options: {
  to: string
  heading: string
  intro: string
  lines: NotificationLine[]
  appUrl: string
}): Mail {
  const items = options.lines.map((line) => {
    const definition = NOTIFICATIONS[line.type]
    return { label: definition.label, subject: line.subject, url: line.url }
  })

  const text = [
    options.intro,
    '',
    ...items.map((item) =>
      item.subject
        ? `- ${item.label}: ${item.subject}\n  ${item.url}`
        : `- ${item.label}\n  ${item.url}`,
    ),
    '',
    'Change what you are emailed about:',
    `${options.appUrl}/settings`,
  ].join('\n')

  const html = [
    `<div style="${SHELL_STYLE}">`,
    `<p>${escapeHtml(options.intro)}</p>`,
    '<ul style="padding-left:1.1em">',
    ...items.map(
      (item) =>
        `<li style="margin-bottom:.6em"><a href="${item.url}">${escapeHtml(
          item.subject ?? item.label,
        )}</a><br><span style="font-size:13px;color:#55636d">${escapeHtml(item.label)}</span></li>`,
    ),
    '</ul>',
    `<p style="font-size:13px;color:#8a949c">`,
    `<a href="${options.appUrl}/settings" style="color:#8a949c">Change what you are emailed about</a>`,
    `</p>`,
    `</div>`,
  ].join('\n')

  return { to: options.to, subject: safeSubject(options.heading), text, html }
}

/**
 * FR-12.4 — the seven-day nudge. It offers two one-click actions and it never
 * says the request failed, because it has not: an author with no answers yet is
 * a normal state (FR-15.1).
 */
export function quietRequestMail(options: {
  to: string
  requestTitle: string
  requestUrl: string
  widenUrl: string
  appUrl: string
}): Mail {
  const text = [
    `Nobody has answered "${options.requestTitle}" yet.`,
    '',
    'That is common and it is not a verdict on the request. Two things often help:',
    '',
    `- Widen the word range, so more people can fit it in: ${options.widenUrl}`,
    `- Let it go out in Sunday's digest to writers in your genres: ${options.requestUrl}`,
    '',
    options.requestUrl,
  ].join('\n')

  const html = [
    `<div style="${SHELL_STYLE}">`,
    `<p>Nobody has answered <a href="${options.requestUrl}">${escapeHtml(
      options.requestTitle,
    )}</a> yet.</p>`,
    `<p>That is common, and it is not a verdict on the request. Two things often help:</p>`,
    '<ul style="padding-left:1.1em">',
    `<li style="margin-bottom:.5em"><a href="${options.widenUrl}">Widen the word range</a>, so more people can fit it in.</li>`,
    `<li><a href="${options.requestUrl}">Send it out in Sunday's digest</a> to writers in your genres.</li>`,
    '</ul>',
    `</div>`,
  ].join('\n')

  return {
    to: options.to,
    subject: safeSubject(`Still waiting: ${options.requestTitle}`),
    text,
    html,
  }
}
