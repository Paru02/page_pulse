import { Router } from 'express';
import { createAudit, getHealth } from '../controllers/audit.controller';
import { validateBody, auditRequestSchema } from '../middlewares/validate.middleware';
import { auditRateLimiter } from '../middlewares/rateLimit.middleware';

const router = Router();

router.get('/health', getHealth);

router.post('/audit', auditRateLimiter, validateBody(auditRequestSchema), createAudit);

export default router;
