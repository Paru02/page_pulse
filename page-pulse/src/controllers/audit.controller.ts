import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { runAudit } from '../services/audit.service';
import { env } from '../config/env';
import { ApiSuccessResponse, AuditReport } from '../types';

/**
 * POST /api/v1/audit
 * Body: { url: string, checkBrokenLinks?: boolean }
 *
 * The controller's only responsibilities are: pull the validated input
 * out of req.body, delegate to the service layer, and wrap the result in
 * the standard success envelope. All business logic lives in services -
 * this keeps the controller trivially readable and means the same
 * runAudit() function can be reused by a CLI, a queue worker, etc.
 */
export const createAudit = asyncHandler(async (req: Request, res: Response) => {
  const { url, checkBrokenLinks } = req.body as { url: string; checkBrokenLinks?: boolean };

  const report: AuditReport = await runAudit({
    url,
    checkBrokenLinks: checkBrokenLinks ?? env.CHECK_BROKEN_LINKS,
  });

  const body: ApiSuccessResponse<AuditReport> = {
    success: true,
    data: report,
    requestId: req.id,
    timestamp: new Date().toISOString(),
  };

  res.status(200).json(body);
});

/** GET /api/v1/health - liveness/readiness probe. */
export const getHealth = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      environment: env.NODE_ENV,
    },
    requestId: req.id,
    timestamp: new Date().toISOString(),
  });
});
