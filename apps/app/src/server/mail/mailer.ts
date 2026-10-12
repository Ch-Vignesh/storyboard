import { appendFileSync } from 'node:fs'

import { Resend } from 'resend'

import { env } from '@/env'
import { logger } from '@/lib/logger'

import { createSmtpMailer, type SmtpConfig } from './smtp'

/** Plain, single-column, no tracking pixels (FR-12.5). */
export type Mail = {
  to: string
  subject: string
  text: string
  html: string
}

export type Mailer = {
  send(mail: Mail): Promise<void>
}

/**
 * Development mailer: prints the message to the server log instead of sending it.
 *
 * When `MAIL_LOG_FILE` is set it also appends each message to that file, which
 * is how the Playwright flows read a verification link without a mail server
 * (architecture section 8). It can only ever run when no mail provider is
 * configured — that is what selects this mailer at all — so there is no path
 * by which production writes real messages to disk.
 */
export const consoleMailer: Mailer = {
  send(mail) {
    const rule = '-'.repeat(72)
    const rendered = `\n${rule}\nMAIL (not sent: no mail provider is configured)\nTo: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n${rule}\n\n`
    process.stdout.write(rendered)
    if (env.MAIL_LOG_FILE) {
      appendFileSync(env.MAIL_LOG_FILE, rendered, 'utf8')
    }
    return Promise.resolve()
  },
}

function createResendMailer(apiKey: string): Mailer {
  const resend = new Resend(apiKey)
  return {
    async send(mail) {
      const { error } = await resend.emails.send({
        from: env.EMAIL_FROM,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      })
      if (error) {
        logger.error(
          { event: 'mail.failed', to: mail.to, subject: mail.subject, error },
          'email not sent',
        )
        throw new Error(`Email could not be sent: ${error.message}`)
      }
    },
  }
}

/**
 * `SMTP_HOST`, `SMTP_USER` and `SMTP_PASSWORD`: all three or none. Two of
 * three is a mistake, not a choice, and falling back to the console mailer
 * would hide it behind a healthy-looking log while every sign-up strands.
 */
function smtpConfig(): SmtpConfig | undefined {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = env
  if (!SMTP_HOST && !SMTP_USER && !SMTP_PASSWORD) return undefined
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) {
    throw new Error(
      'SMTP is half configured: set SMTP_HOST, SMTP_USER and SMTP_PASSWORD together, or none of them.',
    )
  }
  return {
    host: SMTP_HOST,
    port: SMTP_PORT,
    user: SMTP_USER,
    password: SMTP_PASSWORD,
    from: env.EMAIL_FROM,
  }
}

function withFailureLog(inner: Mailer): Mailer {
  return {
    async send(mail) {
      try {
        await inner.send(mail)
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        logger.error(
          { event: 'mail.failed', to: mail.to, subject: mail.subject, error: reason },
          'email not sent',
        )
        throw new Error(`Email could not be sent: ${reason}`)
      }
    },
  }
}

let mailer: Mailer | undefined

/** Resend when its key is set, then SMTP (decision 0029), then the console. */
export function getMailer(): Mailer {
  if (mailer) return mailer
  if (env.RESEND_API_KEY) {
    mailer = createResendMailer(env.RESEND_API_KEY)
  } else {
    const smtp = smtpConfig()
    mailer = smtp ? withFailureLog(createSmtpMailer(smtp)) : consoleMailer
  }
  return mailer
}
