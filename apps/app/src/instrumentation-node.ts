import { logger } from '@/lib/logger'

/** Node only: `instrumentation.ts` imports this on the Node runtime alone. */
logger.info(
  {
    event: 'instance.start',
    uptimeMs: Math.round(process.uptime() * 1000),
    region: process.env.VERCEL_REGION ?? 'local',
  },
  'server instance started',
)
