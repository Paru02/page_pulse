import Redis from 'ioredis';
import NodeCache from 'node-cache';
import { env } from '../config/env';
import { logger } from '../config/logger';

/**
 * A single cache interface backed by either Redis (preferred, shared
 * across instances - important once this service is horizontally scaled)
 * or an in-process NodeCache (fallback for local dev / when REDIS_URL is
 * not configured or unreachable). Callers never need to know which one
 * is active.
 */
class CacheService {
  private redis: Redis | null = null;
  private memoryCache: NodeCache;
  private backend: 'redis' | 'memory' = 'memory';
  private redisReady = false;

  constructor() {
    this.memoryCache = new NodeCache({
      stdTTL: env.CACHE_TTL_SECONDS,
      checkperiod: Math.max(60, Math.floor(env.CACHE_TTL_SECONDS / 2)),
      useClones: false,
    });

    if (env.REDIS_URL) {
      this.redis = new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
      });

      this.redis.on('ready', () => {
        this.redisReady = true;
        this.backend = 'redis';
        logger.info('Redis cache connected - using Redis as primary cache backend.');
      });

      this.redis.on('error', (err) => {
        if (this.redisReady) {
          logger.warn({ err }, 'Redis error after being ready - falling back to in-memory cache.');
        }
        this.redisReady = false;
        this.backend = 'memory';
      });

      this.redis.connect().catch((err) => {
        logger.warn(
          { err: err.message },
          'Redis unavailable at startup - falling back to in-memory cache (NodeCache).',
        );
        this.backend = 'memory';
      });
    } else {
      logger.info('REDIS_URL not configured - using in-memory cache (NodeCache).');
    }
  }

  getBackendName(): 'redis' | 'memory' {
    return this.backend;
  }

  async get<T>(key: string): Promise<T | undefined> {
    if (this.backend === 'redis' && this.redis && this.redisReady) {
      try {
        const raw = await this.redis.get(key);
        return raw ? (JSON.parse(raw) as T) : undefined;
      } catch (err) {
        logger.warn({ err }, 'Redis GET failed, falling back to memory cache for this read.');
        return this.memoryCache.get<T>(key);
      }
    }
    return this.memoryCache.get<T>(key);
  }

  async set<T>(key: string, value: T, ttlSeconds: number = env.CACHE_TTL_SECONDS): Promise<void> {
    if (this.backend === 'redis' && this.redis && this.redisReady) {
      try {
        await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
        return;
      } catch (err) {
        logger.warn({ err }, 'Redis SET failed, writing to memory cache instead.');
      }
    }
    this.memoryCache.set(key, value, ttlSeconds);
  }

  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit().catch(() => undefined);
    }
    this.memoryCache.close();
  }
}

export const cacheService = new CacheService();
