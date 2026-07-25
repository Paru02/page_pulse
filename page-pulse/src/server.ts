import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { cacheService } from './services/cache.service';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, env: env.NODE_ENV, cacheBackend: cacheService.getBackendName() },
    `Page Pulse listening on port ${env.PORT}`,
  );
});

/**
 * Graceful shutdown: stop accepting new connections, let in-flight
 * requests finish, close the cache connection, then exit. Render (and
 * most container platforms) send SIGTERM on deploys/scale-downs; failing
 * to handle it results in dropped in-flight requests.
 */
function shutdown(signal: string): void {
  logger.info({ signal }, 'Shutdown signal received, closing server gracefully.');
  server.close(async (err) => {
    if (err) {
      logger.error({ err }, 'Error while closing HTTP server.');
      process.exitCode = 1;
    }
    await cacheService.close();
    logger.info('Shutdown complete.');
    process.exit(process.exitCode ?? 0);
  });

  // Force-exit if something hangs (e.g. a stuck outbound fetch) past a
  // reasonable grace period, so the platform doesn't have to SIGKILL us.
  setTimeout(() => {
    logger.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection.');
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception - exiting.');
  process.exit(1);
});
