import pino from 'pino';
import { env } from './env';

/**
 * Structured JSON logger.
 *
 * In development we pipe through pino-pretty for human-readable output.
 * In production/test we emit raw JSON lines, which is what log aggregators
 * (Render logs, Datadog, CloudWatch, etc.) expect - pretty-printing in prod
 * costs CPU for zero benefit since nothing renders it visually there.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'page-pulse' },
  timestamp: pino.stdTimeFunctions.isoTime,
  transport:
    env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});

export type Logger = typeof logger;
