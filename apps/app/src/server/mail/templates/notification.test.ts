import { describe, expect, it } from 'vitest'

import { NOTIFICATIONS } from '@/lib/schemas/notifications'

import { digestMail, notificationMail } from './notification'
import { verifyEmailMail } from './verify-email'

/**
 * FR-12.1, FR-12.5 (phase 14, item 2.4) — the way out is in the headers and in
 * the footer, and only on email that can be turned off.
 */
describe('List-Unsubscribe', () => {
  const unsubscribeUrl = 'http://t/unsubscribe?t=abc.def'
  const appUrl = 'http://t'

  it('is on a notification email, with the footer that says why it came', () => {
    const mail = notificationMail({
      to: 'a@example.test',
      line: { type: 'SUGGESTION_RECEIVED', url: 'http://t/s/x', subject: 'The harbour' },
      appUrl,
      unsubscribeUrl,
    })
    expect(mail.headers).toEqual({
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    })
    expect(mail.text).toContain("You're getting this because email for")
    expect(mail.text).toContain(`Stop emails like this: ${unsubscribeUrl}`)
    expect(mail.text).toContain('All email settings: http://t/settings')
    expect(mail.html).toContain(`href="${unsubscribeUrl}"`)
  })

  it('names every kind of email a digest carries, once each', () => {
    const line = (type: 'IDEA_RECEIVED' | 'SUGGESTION_RECEIVED') => ({ type, url: 'http://t/s/x' })
    const mail = digestMail({
      to: 'a@example.test',
      heading: 'Three things happened',
      intro: 'Since the last time we wrote:',
      lines: [line('IDEA_RECEIVED'), line('IDEA_RECEIVED'), line('SUGGESTION_RECEIVED')],
      appUrl,
      unsubscribeUrl,
    })
    expect(mail.headers?.['List-Unsubscribe']).toBe(`<${unsubscribeUrl}>`)
    const because = mail.text.split('\n').find((row) => row.startsWith("You're getting this")) ?? ''
    const idea = NOTIFICATIONS.IDEA_RECEIVED.label.toLowerCase()
    expect(because).toContain(idea)
    expect(because).toContain(NOTIFICATIONS.SUGGESTION_RECEIVED.label.toLowerCase())
    expect(because.split(idea).length - 1).toBe(1)
  })

  it('is absent from a confirmation email, which cannot be turned off', () => {
    const mail = verifyEmailMail({ to: 'a@example.test', url: 'http://t/verify?token=x' })
    expect(mail.headers).toBeUndefined()
    expect(mail.text).not.toContain('Stop emails like this')
  })
})

/** Phase 14, item 6.9 — the email says who did what, in the row's own words. */
describe('the line’s sentence', () => {
  const unsubscribeUrl = 'http://t/unsubscribe?t=abc.def'
  const appUrl = 'http://t'
  const line = {
    type: 'SUGGESTION_PASSED' as const,
    url: 'http://t/s/x/help/y/s/z',
    subject: 'The harbour',
    sentence: 'Maya went a different way on chapter 4. Your version is still on your profile.',
  }

  it('is what one message says, and what each digest item says under its link', () => {
    const one = notificationMail({ to: 'a@example.test', line, appUrl, unsubscribeUrl })
    expect(one.text.startsWith(line.sentence)).toBe(true)
    expect(one.html).toContain('<p>Maya went a different way on chapter 4.')
    expect(one.text).not.toContain(NOTIFICATIONS.SUGGESTION_PASSED.sentence)

    const many = digestMail({
      to: 'a@example.test',
      heading: 'Two things happened',
      intro: 'Since the last time we wrote:',
      lines: [line, { type: 'IDEA_RECEIVED', url: 'http://t/s/x/help/q' }],
      appUrl,
      unsubscribeUrl,
    })
    expect(many.text).toContain(`${NOTIFICATIONS.SUGGESTION_PASSED.label}: The harbour`)
    expect(many.text).toContain(line.sentence)
    expect(many.html).toContain(
      `<span style="font-size:13px;color:#55636d">${line.sentence}</span>`,
    )
    // A line with no sentence of its own reads as its type does.
    expect(many.text).toContain(NOTIFICATIONS.IDEA_RECEIVED.sentence)
  })
})
