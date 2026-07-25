import path from 'path';
import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { logger } from './config/logger';
import { requestIdMiddleware } from './middlewares/requestId.middleware';
import { notFoundMiddleware, errorMiddleware } from './middlewares/error.middleware';
import routes from './routes';

// Resolves to the project-root `public/` directory whether running via
// ts-node-dev (__dirname = src/) or the compiled build (__dirname = dist/) -
// `public/` is a sibling of both, never copied into either.
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

/**
 * Builds and returns the Express app WITHOUT calling .listen(). Keeping
 * app construction separate from server startup lets tests import this
 * module and drive it with Supertest against an in-memory server, with no
 * real port bound and no risk of port collisions in CI.
 */
export function createApp(): Express {
  const app = express();

  // Trust the first proxy hop (Render, and most PaaS providers, sit behind
  // one) so req.ip reflects the real client IP for rate limiting/logging
  // instead of the proxy's own address.
  app.set('trust proxy', 1);

  // --- Security & performance middleware ---------------------------------
  // The bundled browser test UI (public/index.html) is a single self-contained
  // file with an inline <script> and <style> block for simplicity. Helmet's
  // default CSP blocks inline script/style, so we explicitly allow 'unsafe-inline'
  // for script-src/style-src while keeping every other Helmet protection
  // (frame-ancestors, object-src, etc.) at its secure default. The JSON API
  // itself never renders HTML, so this widening only affects the static demo page.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          'script-src': ["'self'", "'unsafe-inline'"],
          'style-src': ["'self'", "'unsafe-inline'"],
        },
      },
    }),
  );
  app.use(
    cors({
      origin: env.CORS_ORIGINS === '*' ? '*' : env.CORS_ORIGINS,
      methods: ['GET', 'POST'],
    }),
  );
  app.use(compression());

  // --- Static browser test UI ---------------------------------------------
  // Serves public/index.html at GET / so the API can be exercised from a
  // browser without curl/Postman. Purely a convenience demo layer - the
  // JSON API under /api/v1 is the actual product surface.
  app.use(express.static(PUBLIC_DIR));

  // --- Body parsing --------------------------------------------------------
  app.use(express.json({ limit: '32kb' })); // audit requests are tiny; caps abuse via huge payloads

  // --- Observability ---------------------------------------------------
  app.use(requestIdMiddleware);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).id,
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      // Keep access logs lean: method, url, status, duration - not full
      // headers/bodies, which could contain sensitive data.
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  // --- Routes --------------------------------------------------------------
  app.use(routes);

  // --- 404 + centralized error handling (order matters: last) -------------
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}
