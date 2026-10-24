import { SERVER_ERRORS } from '@/lib/schemas/constants'

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

export type AnnouncedKind = {
  source: string
  location: string
  name: string
  message: string
  count: number
  /** Already written out, with its zone: the email cannot know the reader's. */
  firstSeen: string
}

function howOften(count: number): string {
  return count === 1 ? 'once' : `${String(count)} times`
}

const EVERY =
  SERVER_ERRORS.alertEveryMinutes === 60
    ? 'once an hour'
    : `once every ${String(SERVER_ERRORS.alertEveryMinutes)} minutes`

/**
 * Phase 14, item 10.1 (NFR-7, D-10) — to whoever may read the error log, when
 * a kind of server fault appears that nobody has been told about. What each
 * kind says is what its row keeps: where, the error, the message cut short,
 * never a request or anybody's writing. The stack is on the Errors screen.
 */
export function serverErrorsMail(input: {
  to: string
  kinds: readonly AnnouncedKind[]
  /** Kinds this email does not list, past `SERVER_ERRORS.pageKinds`. */
  more: number
  errorsUrl: string
}): Mail {
  const total = input.kinds.length + input.more
  const opening =
    total === 1
      ? 'A kind of server error has appeared that nobody has been told about yet.'
      : `${String(total)} kinds of server error have appeared that nobody has been told about yet.`
  const closing = `You are sent this because you can read the error log. It comes at most ${EVERY}, and only for a kind nobody has been told about.`
  const moreLine =
    input.more > 0 ? `And ${String(input.more)} more, on the Errors screen.` : undefined

  const text = [
    opening,
    '',
    ...input.kinds.flatMap((kind) => [
      `${kind.location} (${kind.source})`,
      `${kind.name}: ${kind.message}`,
      `${howOften(kind.count)}, first on ${kind.firstSeen}`,
      '',
    ]),
    ...(moreLine ? [moreLine, ''] : []),
    'Every kind, with the top of its stack:',
    input.errorsUrl,
    '',
    closing,
  ].join('\n')

  const items = input.kinds
    .map(
      (kind) => `      <li style="margin:0 0 16px">
        <div style="font-family:ui-monospace,monospace;font-size:14px">${escapeHtml(kind.location)} <span style="color:#55636d">(${escapeHtml(kind.source)})</span></div>
        <div>${escapeHtml(kind.name)}: ${escapeHtml(kind.message)}</div>
        <div style="color:#55636d;font-size:14px">${escapeHtml(howOften(kind.count))}, first on ${escapeHtml(kind.firstSeen)}</div>
      </li>`,
    )
    .join('\n')
  const url = escapeHtml(input.errorsUrl)
  const html = `<!doctype html>
<html lang="en">
  <body style="${BODY_STYLE}">
    <div style="max-width:520px;margin:0 auto">
      <p style="margin:0 0 16px">${escapeHtml(opening)}</p>
      <ul style="margin:0 0 16px;padding-left:20px">
${items}
      </ul>
${moreLine ? `      <p style="margin:0 0 16px">${escapeHtml(moreLine)}</p>\n` : ''}      <p style="margin:0 0 16px"><a href="${url}" style="color:#2b5ca8">Every kind, with the top of its stack</a></p>
      <p style="margin:0;color:#55636d">${escapeHtml(closing)}</p>
    </div>
  </body>
</html>`

  return {
    to: input.to,
    subject:
      total === 1
        ? 'Draftboard: a new kind of server error'
        : `Draftboard: ${String(total)} new kinds of server error`,
    text,
    html,
  }
}
