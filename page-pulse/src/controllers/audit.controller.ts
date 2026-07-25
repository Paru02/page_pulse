import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { runAudit } from '../services/audit.service';
import { env } from '../config/env';
import { ApiSuccessResponse, AuditReport } from '../types';

export const createAudit = asyncHandler(async (req: Request, res: Response) => {
  const { url, checkBrokenLinks } = req.body as { url: string; checkBrokenLinks?: boolean };

  const report: AuditReport = await runAudit({
    url,
    checkBrokenLinks: checkBrokenLinks ?? env.CHECK_BROKEN_LINKS,
  });

  const body: ApiSuccessResponse<AuditReport> = {
    success: true,
    data: report,
    requestId: String(req.id),
    timestamp: new Date().toISOString(),
  };

  res.status(200).json(body);
});

export const getHealth = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      environment: env.NODE_ENV,
    },
    requestId: String(req.id),
    timestamp: new Date().toISOString(),
  });
});
