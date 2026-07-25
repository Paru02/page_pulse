import { Router } from 'express';
import auditRoutes from './audit.routes';

const router = Router();

// Versioned under /api/v1 so breaking changes in future can live at /api/v2
// without disrupting existing integrations.
router.use('/api/v1', auditRoutes);

export default router;
