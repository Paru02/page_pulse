import { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

/**
 * Attaches a unique request ID to every incoming request, honoring an
 * inbound X-Request-Id header if present (useful when this service sits
 * behind a gateway/load balancer that already generates one), and echoes
 * it back on the response so clients can correlate logs/support tickets.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('X-Request-Id');
  req.id = incoming && incoming.trim().length > 0 ? incoming : uuidv4();
  res.setHeader('X-Request-Id', req.id);
  next();
}
