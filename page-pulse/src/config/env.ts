import dotenv from 'dotenv';

dotenv.config();

/**
 * Parses an environment variable as an integer, falling back to a default
 * when missing or invalid. Centralizing this avoids scattering NaN checks
 * across the codebase.
 */
function toInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function toBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.trim().toLowerCase() === 'true';
}

function toOrigins(value: string | undefined): string[] | '*' {
  if (!value || value.trim() === '*' || value.trim() === '') return '*';
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: toInt(process.env.PORT, 3000),
  IS_PRODUCTION: process.env.NODE_ENV === 'production',
  IS_TEST: process.env.NODE_ENV === 'test',

  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  CORS_ORIGINS: toOrigins(process.env.CORS_ORIGINS),

  FETCH_TIMEOUT_MS: toInt(process.env.FETCH_TIMEOUT_MS, 8000),
  FETCH_MAX_REDIRECTS: toInt(process.env.FETCH_MAX_REDIRECTS, 5),
  FETCH_MAX_CONTENT_BYTES: toInt(process.env.FETCH_MAX_CONTENT_BYTES, 5 * 1024 * 1024),
  USER_AGENT: process.env.USER_AGENT || 'PagePulse-Bot/1.0 (+https://digitalheroes.example/page-pulse)',

  MAX_CONCURRENT_AUDITS: toInt(process.env.MAX_CONCURRENT_AUDITS, 10),

  CHECK_BROKEN_LINKS: toBool(process.env.CHECK_BROKEN_LINKS, true),
  MAX_LINKS_TO_CHECK: toInt(process.env.MAX_LINKS_TO_CHECK, 15),
  BROKEN_LINK_TIMEOUT_MS: toInt(process.env.BROKEN_LINK_TIMEOUT_MS, 4000),

  RATE_LIMIT_WINDOW_MS: toInt(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
  RATE_LIMIT_MAX_REQUESTS: toInt(process.env.RATE_LIMIT_MAX_REQUESTS, 30),

  CACHE_TTL_SECONDS: toInt(process.env.CACHE_TTL_SECONDS, 300),
  REDIS_URL: process.env.REDIS_URL || '',
} as const;

export type Env = typeof env;
