import { NextFunction, Request, Response } from 'express';
import { z, ZodError, ZodTypeAny } from 'zod';
import { ApiError } from '../utils/ApiError';
import { validateUrlSyntax } from '../utils/url.util';

/**
 * Schema for POST /api/v1/audit request bodies.
 * The URL check is layered: zod enforces "is a non-empty string", then
 * our custom .refine() runs the stricter SSRF-aware syntax validation
 * from url.util so both concerns live behind one schema.
 */
export const auditRequestSchema = z.object({
  url: z
    .string({ required_error: 'url is required.' })
    .min(1, 'url must not be empty.')
    .max(2048, 'url exceeds maximum length of 2048 characters.')
    .refine(
      (value) => validateUrlSyntax(value).valid,
      (value) => ({ message: validateUrlSyntax(value).reason || 'Invalid URL.' }),
    ),
  checkBrokenLinks: z.boolean().optional(),
});

/**
 * Generic factory: validates req.body against the given zod schema,
 * replacing req.body with the parsed (and thus normalized/typed) result.
 * Reusable for any future endpoint without duplicating error formatting.
 */
export function validateBody(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.errors.map((e) => ({ path: e.path.join('.'), message: e.message }));
        next(ApiError.badRequest('Request validation failed.', details));
        return;
      }
      next(err);
    }
  };
}
