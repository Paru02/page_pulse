// Ensures deterministic, isolated config for the test run. NODE_ENV=test is
// already set via the `test` npm script (cross-env), this file fills in the
// rest so tests never depend on a developer's local .env file.
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.REDIS_URL = '';
process.env.RATE_LIMIT_MAX_REQUESTS = '1000';
process.env.RATE_LIMIT_WINDOW_MS = '60000';
process.env.CACHE_TTL_SECONDS = '60';
process.env.FETCH_TIMEOUT_MS = '5000';
process.env.CHECK_BROKEN_LINKS = 'false';
