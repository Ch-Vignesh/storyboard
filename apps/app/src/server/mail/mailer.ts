import { Resend } from 'resend'

import { env } from '@/env'
import { logger } from '@/lib/logger'

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

/** Development mailer: prints the message to the server log instead of sending it. */
export const consoleMailer: Mailer = {
  send(mail) {
    const rule = '-'.repeat(72)
    process.stdout.write(
      `\n${rule}\nMAIL (not sent: RESEND_API_KEY is unset)\nTo: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n${rule}\n\n`,
    )
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

let mailer: Mailer | undefined

export function getMailer(): Mailer {
  mailer ??= env.RESEND_API_KEY ? createResendMailer(env.RESEND_API_KEY) : consoleMailer
  return mailer
}
