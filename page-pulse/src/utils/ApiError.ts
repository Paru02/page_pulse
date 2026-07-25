/**
 * Represents a known, "operational" error - one we deliberately raised
 * because of bad input, an unreachable target site, a timeout, etc.
 * Distinguishing these from *programmer* errors (bugs) lets the error
 * middleware decide what's safe to expose to the client.
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;
  public readonly isOperational = true;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, ApiError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  }

  static unprocessable(message: string, details?: unknown): ApiError {
    return new ApiError(422, 'UNPROCESSABLE_TARGET', message, details);
  }

  static tooManyRequests(message: string): ApiError {
    return new ApiError(429, 'RATE_LIMITED', message);
  }

  static gatewayTimeout(message: string): ApiError {
    return new ApiError(504, 'UPSTREAM_TIMEOUT', message);
  }

  static badGateway(message: string, details?: unknown): ApiError {
    return new ApiError(502, 'UPSTREAM_FETCH_FAILED', message, details);
  }

  static internal(message = 'Internal server error'): ApiError {
    return new ApiError(500, 'INTERNAL_ERROR', message);
  }

  static notFound(message = 'Resource not found'): ApiError {
    return new ApiError(404, 'NOT_FOUND', message);
  }
}
