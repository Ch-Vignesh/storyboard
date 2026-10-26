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
  /** Item 6.9 — how it reads, naming who acted (`sentenceFor`); the type's own sentence when absent. */
  sentence?: string
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

function listOf(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1] ?? ''}`
}

/**
 * FR-12.1, FR-12.5 (phase 14, item 2.4) — why this email came, and the two
 * ways out: one click for emails like this one, or every email setting. The
 * same address goes in the `List-Unsubscribe` headers (RFC 8058), so a mail
 * program can offer "Unsubscribe" beside the sender's name. Only notification
 * and digest email carries them; the transactional emails (confirm, reset,
 * account exists, password changed, deletion) carry neither, because they
 * cannot be turned off.
 */
function footer(options: {
  appUrl: string
  unsubscribeUrl: string
  types: readonly NotificationType[]
}): { text: string[]; html: string; headers: Record<string, string> } {
  const kinds = listOf(
    [...new Set(options.types)].map((type) => NOTIFICATIONS[type].label.toLowerCase()),
  )
  const because = `You're getting this because email for ${kinds} is on in your settings.`
  return {
    text: [
      because,
      `Stop emails like this: ${options.unsubscribeUrl}`,
      `All email settings: ${options.appUrl}/settings`,
    ],
    html: [
      `<p style="font-size:13px;color:#8a949c">${escapeHtml(because)}<br>`,
      `<a href="${options.unsubscribeUrl}" style="color:#8a949c">Stop emails like this</a> · `,
      `<a href="${options.appUrl}/settings" style="color:#8a949c">All email settings</a>`,
      `</p>`,
    ].join(''),
    headers: {
      'List-Unsubscribe': `<${options.unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  }
}

/** One message about one thing (FR-12.3's immediate class). */
export function notificationMail(options: {
  to: string
  line: NotificationLine
  appUrl: string
  unsubscribeUrl: string
}): Mail {
  const definition = NOTIFICATIONS[options.line.type]
  const subject = options.line.subject
    ? safeSubject(`${definition.label}: ${options.line.subject}`)
    : definition.label
  const foot = footer({ ...options, types: [options.line.type] })
  const sentence = options.line.sentence ?? definition.sentence

  const text = [sentence, '', options.line.url, '', ...foot.text].join('\n')

  const html = [
    `<div style="${SHELL_STYLE}">`,
    `<p>${escapeHtml(sentence)}</p>`,
    `<p><a href="${options.line.url}">${escapeHtml(options.line.subject ?? 'Open it')}</a></p>`,
    foot.html,
    `</div>`,
  ].join('\n')

  return { to: options.to, subject, text, html, headers: foot.headers }
}

/** Several things at once (FR-12.3's hourly and weekly classes). */
export function digestMail(options: {
  to: string
  heading: string
  intro: string
  lines: NotificationLine[]
  appUrl: string
  unsubscribeUrl: string
}): Mail {
  const items = options.lines.map((line) => {
    const definition = NOTIFICATIONS[line.type]
    return {
      label: definition.label,
      subject: line.subject,
      url: line.url,
      sentence: line.sentence ?? definition.sentence,
    }
  })
  const foot = footer({ ...options, types: options.lines.map((line) => line.type) })

  const text = [
    options.intro,
    '',
    ...items.map((item) =>
      item.subject
        ? `- ${item.label}: ${item.subject}\n  ${item.sentence}\n  ${item.url}`
        : `- ${item.label}\n  ${item.sentence}\n  ${item.url}`,
    ),
    '',
    ...foot.text,
  ].join('\n')

  const html = [
    `<div style="${SHELL_STYLE}">`,
    `<p>${escapeHtml(options.intro)}</p>`,
    '<ul style="padding-left:1.1em">',
    ...items.map(
      (item) =>
        `<li style="margin-bottom:.6em"><a href="${item.url}">${escapeHtml(
          item.subject ?? item.label,
        )}</a><br><span style="font-size:13px;color:#55636d">${escapeHtml(item.sentence)}</span></li>`,
    ),
    '</ul>',
    foot.html,
    `</div>`,
  ].join('\n')

  return {
    to: options.to,
    subject: safeSubject(options.heading),
    text,
    html,
    headers: foot.headers,
  }
}

/**
 * FR-12.4 — the seven-day nudge. It never says the request failed, because it
 * has not: an author with no answers yet is a normal state (FR-15.1).
 *
 * FR-12.4's one-click widening is the request's edit page since phase 14's
 * item 6.1, so the nudge links there (item 6.16): "Change the word range".
 * The Sunday digest still takes requests from its own week, so a week-old one
 * is never in it, and the mail does not pretend otherwise. This offered both
 * as links to the request page until the 2026-10-16 spec review.
 */
export function quietRequestMail(options: {
  to: string
  requestTitle: string
  requestUrl: string
  /** Item 6.16 — the request's edit page, where the word range is changed. */
  editUrl: string
  /**
   * A "help me think" request has no word range to widen, and the email told
   * its author to change one (2026-10-24 final pass): it is told to sharpen
   * the ask instead, which is what its edit page offers.
   */
  helpMeThink?: boolean
  appUrl: string
  unsubscribeUrl: string
}): Mail {
  const foot = footer({ ...options, types: ['REQUEST_QUIET_SEVEN_DAYS'] })
  const fix = options.helpMeThink
    ? {
        why: 'An ask that says exactly where you are stuck, and what you have tried, gives people something to answer.',
        link: 'Change the ask',
      }
    : {
        why: 'If it asks for a narrow range of words, a wider one lets more people fit it in.',
        link: 'Change the word range',
      }

  const text = [
    `Nobody has answered "${options.requestTitle}" yet.`,
    '',
    'That is common, and it is not a verdict on the request. It is still open, and helpers looking for something nobody has answered find it under "No answers yet" in Browse.',
    '',
    fix.why,
    `${fix.link}: ${options.editUrl}`,
    '',
    options.requestUrl,
    '',
    ...foot.text,
  ].join('\n')

  const html = [
    `<div style="${SHELL_STYLE}">`,
    `<p>Nobody has answered <a href="${options.requestUrl}">${escapeHtml(
      options.requestTitle,
    )}</a> yet.</p>`,
    `<p>That is common, and it is not a verdict on the request. It is still open, and helpers looking for something nobody has answered find it under “No answers yet” in Browse.</p>`,
    `<p>${escapeHtml(fix.why)} <a href="${options.editUrl}">${fix.link}</a>.</p>`,
    foot.html,
    `</div>`,
  ].join('\n')

  return {
    to: options.to,
    subject: safeSubject(`Still waiting: ${options.requestTitle}`),
    text,
    html,
    headers: foot.headers,
  }
}
