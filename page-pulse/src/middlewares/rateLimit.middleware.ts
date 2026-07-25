import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';

/**
 * Per-IP sliding-window rate limiter. Applied at the router level to the
 * audit endpoint specifically (the most expensive one), rather than
 * globally, so lightweight endpoints like /health are never throttled.
 *
 * We funnel the "too many requests" case through our own error handler
 * (via `handler`) so rate-limit responses share the exact same JSON error
 * envelope as every other error in the API.
 */
export const auditRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true, // adds RateLimit-* headers
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.ip || 'unknown',
  handler: (_req: Request, _res: Response, next) => {
    next(
      ApiError.tooManyRequests(
        `Rate limit exceeded. Maximum ${env.RATE_LIMIT_MAX_REQUESTS} requests per ${
          env.RATE_LIMIT_WINDOW_MS / 1000
        }s per IP.`,
      ),
    );
  },
});
