import pino from 'pino'

/**
 * Structured JSON logs (NFR-7). Give every interesting line an `event` field,
 * e.g. `logger.info({ event: 'suggestion.accepted', suggestionId }, 'accepted')`,
 * so the socially important moments (accept, pass, restore, spin-off, report)
 * can be queried later.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  base: undefined,
  redact: {
    paths: ['*.password', '*.passwordHash', '*.token', '*.tokenHash'],
    censor: '[redacted]',
  },
})
