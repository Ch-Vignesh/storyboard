/**
 * Email header injection.
 *
 * A Subject is a header, and a header ends at a newline. Request titles reach
 * one, and a title is user input whose schema only trims the ends — so this is
 * the boundary that decides whether an author can append headers of their own.
 *
 * No database needed: it is a property of the template and the input schema.
 */
import { describe, expect, it } from 'vitest'

import { createRequestSchema } from '@/lib/schemas/help'

import { notificationMail, quietRequestMail } from './templates/notification'

const CR = String.fromCharCode(13)
const LF = String.fromCharCode(10)
const NUL = String.fromCharCode(0)

describe('subject lines cannot carry headers', () => {
  it('strips a newline and keeps whatever followed it as ordinary text', () => {
    const mail = quietRequestMail({
      to: 'author@example.test',
      requestTitle: `Chapter four${CR}${LF}Bcc: everyone@example.test`,
      requestUrl: 'https://example.test/s/a/help/b',
      widenUrl: 'https://example.test/s/a/help/b?widen=1',
      appUrl: 'https://example.test',
    })

    expect(mail.subject).not.toContain(CR)
    expect(mail.subject).not.toContain(LF)
    expect(mail.subject).toBe('Still waiting: Chapter four Bcc: everyone@example.test')
  })

  it('strips control characters from a notification subject too', () => {
    const mail = notificationMail({
      to: 'someone@example.test',
      line: {
        type: 'SUGGESTION_RECEIVED',
        url: 'https://example.test/s/a',
        subject: `A title with${NUL} a null and${LF}a newline`,
      },
      appUrl: 'https://example.test',
    })

    expect(mail.subject).not.toContain(NUL)
    expect(mail.subject).not.toContain(LF)
    expect(mail.subject).not.toContain(CR)
  })

  it('caps a very long subject', () => {
    const mail = quietRequestMail({
      to: 'author@example.test',
      requestTitle: 'x'.repeat(500),
      requestUrl: 'https://example.test/s/a/help/b',
      widenUrl: 'https://example.test/s/a/help/b?widen=1',
      appUrl: 'https://example.test',
    })
    expect(mail.subject.length).toBeLessThanOrEqual(200)
  })
})

describe('a request title is refused at the input as well', () => {
  const base = {
    sectionId: 'abc',
    kind: 'UNBLOCK' as const,
    ask: 'word '.repeat(30),
    minWords: 150,
    maxWords: 1000,
  }

  it('accepts an ordinary title', () => {
    expect(
      createRequestSchema.safeParse({ ...base, title: 'Chapter four will not start' }).success,
    ).toBe(true)
  })

  it('refuses one containing a line break', () => {
    const result = createRequestSchema.safeParse({
      ...base,
      title: `Chapter four${CR}${LF}Bcc: someone@example.test`,
    })
    expect(result.success).toBe(false)
  })

  it('refuses one containing any other control character', () => {
    expect(createRequestSchema.safeParse({ ...base, title: `Chapter${NUL}four` }).success).toBe(
      false,
    )
  })
})
