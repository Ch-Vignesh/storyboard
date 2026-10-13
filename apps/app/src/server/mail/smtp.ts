import type { Transporter } from 'nodemailer'

import { SMTP_TIMEOUTS_MS } from '@/lib/schemas/constants'

import type { Mailer } from './mailer'

/**
 * Mail over SMTP (decision 0029): Gmail with an app password, or any provider
 * that speaks it.
 *
 * Deliberately free of `@/env` and the logger, so `pnpm check-deploy` can send
 * its test message through exactly this code rather than a copy of it. The
 * caller passes the configuration in.
 */
export type SmtpConfig = {
  host: string
  port: number
  user: string
  password: string
  /** `EMAIL_FROM`. Gmail sends as `user` whatever this says, so make it match. */
  from: string
}

export type SmtpMailer = Mailer & {
  /** Connect and log in without sending anything. */
  verify(): Promise<void>
}

export function createSmtpMailer(config: SmtpConfig): SmtpMailer {
  // Port 465 is TLS from the first byte. Anything else — 587 in practice —
  // starts in plain text and upgrades with STARTTLS. `requireTLS` makes that
  // upgrade a condition rather than a preference, so a server that declines it
  // (or anything in between that strips it) never sees the password.
  const implicitTls = config.port === 465
  // nodemailer loads with the first message, not with the server (phase 10).
  let transport: Promise<Transporter> | null = null
  const connect = () => {
    transport ??= import('nodemailer').then(({ createTransport }) =>
      createTransport({
        host: config.host,
        port: config.port,
        secure: implicitTls,
        requireTLS: !implicitTls,
        auth: { user: config.user, pass: config.password },
        connectionTimeout: SMTP_TIMEOUTS_MS.connect,
        greetingTimeout: SMTP_TIMEOUTS_MS.greeting,
        socketTimeout: SMTP_TIMEOUTS_MS.socket,
      }),
    )
    return transport
  }

  return {
    async send(mail) {
      await (
        await connect()
      ).sendMail({
        from: config.from,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      })
    },
    async verify() {
      await (await connect()).verify()
    },
  }
}
