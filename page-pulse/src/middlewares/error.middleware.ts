import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { ApiError } from '../utils/ApiError';
import { ApiErrorResponse } from '../types';

/** 404 handler for unmatched routes - kept separate from the error middleware itself. */
export function notFoundMiddleware(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} does not exist.`));
}

/**
 * Single point where every error in the application becomes a JSON
 * response. Operational errors (ApiError instances) surface their real
 * status/code/message. Anything else (a genuine bug) is logged with full
 * detail server-side but returns a generic 500 to the client - we never
 * leak stack traces or internal error messages in production.
 *
 * Must be registered LAST, after all routes, and must keep the 4-arg
 * signature (err, req, res, next) - Express uses arity to identify error
 * middleware.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorMiddleware(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const isApiError = err instanceof ApiError;
  const statusCode = isApiError ? err.statusCode : 500;
  const code = isApiError ? err.code : 'INTERNAL_ERROR';
  const message = isApiError ? err.message : 'An unexpected error occurred. Please try again later.';

  const logPayload = {
    requestId: req.id,
    method: req.method,
    path: req.originalUrl,
    statusCode,
    code,
    err: err instanceof Error ? { message: err.message, stack: err.stack } : err,
  };

  if (statusCode >= 500) {
    logger.error(logPayload, 'Request failed with server error');
  } else {
    logger.warn(logPayload, 'Request failed with client error');
  }

  const body: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      ...(isApiError && err.details !== undefined ? { details: err.details } : {}),
    },
    requestId: req.id,
    timestamp: new Date().toISOString(),
  };

  // Never leak internals in production for unexpected errors.
  if (!env.IS_PRODUCTION && !isApiError && err instanceof Error) {
    (body.error as { stack?: string }).stack = err.stack;
  }

  res.status(statusCode).json(body);
}
