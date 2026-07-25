import crypto from 'crypto';
import pLimit from 'p-limit';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { cacheService } from './cache.service';
import { scrapeAndAnalyze } from './scraper.service';
import { AuditReport } from '../types';

/**
 * Global concurrency gate for outbound audits. This is independent of
 * Express's own connection handling: even if 200 requests hit the API at
 * once, only MAX_CONCURRENT_AUDITS outbound fetches to third-party sites
 * run simultaneously. This protects both our own event loop/socket pool
 * and prevents us from behaving like a DDoS tool against target sites.
 */
const limit = pLimit(env.MAX_CONCURRENT_AUDITS);

function cacheKeyFor(url: string, checkBrokenLinks: boolean): string {
  const hash = crypto.createHash('sha256').update(`${url}|${checkBrokenLinks}`).digest('hex');
  return `audit:${hash}`;
}

export interface RunAuditParams {
  url: string;
  checkBrokenLinks: boolean;
}

export async function runAudit({ url, checkBrokenLinks }: RunAuditParams): Promise<AuditReport> {
  const cacheKey = cacheKeyFor(url, checkBrokenLinks);

  const cached = await cacheService.get<Omit<AuditReport, 'cache'>>(cacheKey);
  if (cached) {
    logger.debug({ url }, 'Audit cache hit');
    return {
      ...cached,
      cache: { hit: true, ttlSeconds: env.CACHE_TTL_SECONDS },
    };
  }

  logger.debug({ url, pendingSlots: limit.pendingCount, activeSlots: limit.activeCount }, 'Audit cache miss - queuing scrape');

  const result = await limit(() => scrapeAndAnalyze(url, { checkBrokenLinks }));

  const report: Omit<AuditReport, 'cache'> = {
    requestedUrl: url,
    ...result,
  };

  await cacheService.set(cacheKey, report, env.CACHE_TTL_SECONDS);

  return {
    ...report,
    cache: { hit: false, ttlSeconds: env.CACHE_TTL_SECONDS },
  };
}
