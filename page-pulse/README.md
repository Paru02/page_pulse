# Page Pulse

A production-grade URL Audit Service. Given any public URL, Page Pulse fetches the page and returns
structural, SEO, and performance diagnostics: status code, title, meta description, canonical URL,
image/link counts, response time, content length, on-page SEO issues, and optional broken-link checking.

Built with **Node.js + Express + TypeScript**.

---

## Table of Contents

- [Architecture](#architecture)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Running the Service](#running-the-service)
- [API Documentation](#api-documentation)
  - [POST /api/v1/audit](#post-apiv1audit)
  - [GET /api/v1/health](#get-apiv1health)
  - [Error Format](#error-format)
- [Production Concerns](#production-concerns)
- [Testing](#testing)
- [CI/CD](#cicd)
- [Deployment (Render)](#deployment-render)
- [Project Structure](#project-structure)

---

## Architecture

```
Client
  │
  ▼
[helmet] [cors] [compression] [json body parser]
  │
  ▼
[requestId middleware]  ──► every request gets a UUID, echoed as X-Request-Id
  │
  ▼
[pino-http access logging]
  │
  ▼
Routes  ──►  [rate limiter] ──► [validation middleware (zod)] ──► Controller
                                                                       │
                                                                       ▼
                                                                Service layer
                                                        ┌──────────────┴──────────────┐
                                                        ▼                             ▼
                                                 cache.service                 audit.service
                                                (Redis / NodeCache)          (concurrency-limited
                                                                              orchestration)
                                                                                       │
                                                                                       ▼
                                                                              scraper.service
                                                                          (axios fetch + cheerio parse
                                                                           + SEO rule evaluation)
  │
  ▼
[404 handler] ──► [centralized error middleware] ──► structured JSON error envelope
```

**Layering principle:** dependencies only point downward. Controllers depend on services; services depend
on utils; nothing depends back up. This is what makes the service layer (`runAudit`, `scrapeAndAnalyze`)
reusable outside of HTTP — e.g. from a background worker or CLI — and testable without ever booting Express.

### Key design decisions

| Decision | Reasoning |
|---|---|
| `app.ts` builds the Express app; `server.ts` calls `.listen()` | Lets Supertest exercise the app in-process in tests with zero bound ports — faster, no port collisions in CI. |
| Single `ApiError` class + one error middleware | Every error in the system — validation, timeout, upstream 4xx/5xx, unexpected bugs — resolves to the exact same JSON envelope. Callers integrating against this API only need to handle one error shape. |
| Cache is Redis-first with automatic in-memory fallback | Satisfies "Redis caching (or in-memory if Redis unavailable)" literally: if `REDIS_URL` is unset or the connection fails, the service transparently uses `NodeCache` instead of crashing or degrading. Callers never branch on which backend is active. |
| Global `p-limit` concurrency gate in `audit.service` | Express itself will happily accept hundreds of concurrent requests, but every one of them triggers an *outbound* fetch to a third-party site. Without a gate, this service becomes an unintentional DDoS tool. `MAX_CONCURRENT_AUDITS` caps real outbound work independent of inbound HTTP concurrency. |
| SSRF-aware URL validation (`url.util.ts`) | A "fetch whatever URL the user gives you" service is a classic SSRF vector against internal infrastructure (e.g. cloud metadata endpoints at `169.254.169.254`). We reject private/reserved IP ranges and `localhost` at the syntax level, and re-verify via DNS resolution (`assertResolvesToPublicAddress`) right before the real fetch to catch DNS-rebinding attempts. |
| `scraper.service` vs `audit.service` split | `scraper.service` is a pure "fetch + parse" function with no knowledge of caching or concurrency. `audit.service` is pure orchestration (cache check → concurrency-limited scrape → cache write) with no knowledge of HTML parsing. Each is independently unit/integration-testable. |
| Zod for validation | Runtime validation *and* static TS types derived from the same schema — no drift between what's validated and what the compiler thinks `req.body` looks like. |
| Pino over Winston | Lower overhead structured JSON logging for a request-heavy I/O service; pretty-printed in development via `pino-pretty`, raw JSON in production for log aggregators. (Trivially swappable — the logging surface is isolated to `config/logger.ts` and `pino-http` in `app.ts`.) |

---

## Installation

**Requirements:** Node.js 18+, npm. Redis is optional.

```bash
git clone <your-repo-url> page-pulse
cd page-pulse
npm install
cp .env.example .env
```

Edit `.env` as needed (defaults work out of the box with no Redis required).

## Environment Variables

All variables are documented in [`.env.example`](./.env.example) and centrally parsed/typed in
[`src/config/env.ts`](./src/config/env.ts).

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | `development` \| `production` \| `test` |
| `PORT` | `3000` | HTTP port the server listens on |
| `LOG_LEVEL` | `info` | pino log level |
| `CORS_ORIGINS` | `*` | Comma-separated allowlist, or `*` for all origins |
| `FETCH_TIMEOUT_MS` | `8000` | Timeout for fetching the target page |
| `FETCH_MAX_REDIRECTS` | `5` | Max redirects followed when fetching |
| `FETCH_MAX_CONTENT_BYTES` | `5242880` (5MB) | Max response body size accepted |
| `USER_AGENT` | `PagePulse-Bot/1.0 ...` | User-Agent sent on outbound requests |
| `MAX_CONCURRENT_AUDITS` | `10` | Global concurrency cap on outbound scrapes |
| `CHECK_BROKEN_LINKS` | `true` | Default for the broken-link-checking bonus feature |
| `MAX_LINKS_TO_CHECK` | `15` | Cap on how many links are checked per audit (cost control) |
| `BROKEN_LINK_TIMEOUT_MS` | `4000` | Per-link timeout for broken-link checks |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window, per IP |
| `RATE_LIMIT_MAX_REQUESTS` | `30` | Max requests per window, per IP |
| `CACHE_TTL_SECONDS` | `300` | How long an audit result is cached |
| `REDIS_URL` | *(empty)* | If set, Redis is used as the cache backend; otherwise falls back to in-memory |

## Running the Service

```bash
# Development (auto-reload)
npm run dev

# Production build + run
npm run build
npm start

# Lint / typecheck / format
npm run lint
npm run typecheck
npm run format
```

Server starts at `http://localhost:3000` by default.

### Browser test UI

Open **`http://localhost:3000`** in a browser for a minimal built-in test page (`public/index.html`) —
enter a URL, click "Audit", and see the parsed results rendered without needing curl/Postman. This is a
convenience layer only; the actual product surface is the JSON API under `/api/v1`, documented below.

---

## API Documentation

### `POST /api/v1/audit`

Audits a given URL.

**Request body:**

```json
{
  "url": "https://example.com",
  "checkBrokenLinks": true
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `url` | string | yes | Must be `http`/`https`, well-formed, ≤2048 chars, not pointing at localhost/private IPs |
| `checkBrokenLinks` | boolean | no | Overrides the `CHECK_BROKEN_LINKS` default for this request |

**Example request:**

```bash
curl -X POST http://localhost:3000/api/v1/audit \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "checkBrokenLinks": true}'
```

**Example response — `200 OK`:**

```json
{
  "success": true,
  "data": {
    "requestedUrl": "https://example.com/",
    "finalUrl": "https://example.com/",
    "httpStatus": 200,
    "title": "Example Domain",
    "metaDescription": null,
    "canonicalUrl": null,
    "imageCount": 0,
    "links": {
      "internal": 0,
      "external": 1,
      "total": 1
    },
    "responseTimeMs": 142,
    "contentLengthBytes": 1256,
    "seoIssues": [
      {
        "code": "MISSING_META_DESCRIPTION",
        "severity": "error",
        "message": "Page is missing a meta description, reducing control over search result snippets."
      },
      {
        "code": "MISSING_CANONICAL",
        "severity": "warning",
        "message": "Page does not declare a canonical URL, which can lead to duplicate-content issues."
      },
      {
        "code": "MISSING_H1",
        "severity": "error",
        "message": "Page has no <h1> heading, which harms content structure and accessibility."
      }
    ],
    "brokenLinks": [],
    "fetchedAt": "2026-07-25T04:12:03.881Z",
    "cache": {
      "hit": false,
      "ttlSeconds": 300
    }
  },
  "requestId": "6f6e0f8e-6e3a-4a6a-9e3b-1a9d9f9c9a11",
  "timestamp": "2026-07-25T04:12:03.900Z"
}
```

### `GET /api/v1/health`

Liveness/readiness probe (used by Render's health check).

```bash
curl http://localhost:3000/api/v1/health
```

```json
{
  "success": true,
  "data": { "status": "ok", "uptimeSeconds": 812, "environment": "production" },
  "requestId": "b2c1e5b0-...",
  "timestamp": "2026-07-25T04:12:03.900Z"
}
```

### Error Format

Every error — validation failure, rate limit, upstream timeout, unexpected bug — returns the same shape:

```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Request validation failed.",
    "details": [
      { "path": "url", "message": "url is required." }
    ]
  },
  "requestId": "6f6e0f8e-6e3a-4a6a-9e3b-1a9d9f9c9a11",
  "timestamp": "2026-07-25T04:12:03.900Z"
}
```

| HTTP Status | `error.code` | Meaning |
|---|---|---|
| 400 | `BAD_REQUEST` | Invalid/missing URL, disallowed target (private IP, localhost, bad protocol) |
| 404 | `NOT_FOUND` | Unknown route |
| 404/4xx/5xx | `TARGET_RETURNED_ERROR` | The target page itself returned that status |
| 429 | `RATE_LIMITED` | Per-IP rate limit exceeded |
| 502 | `UPSTREAM_FETCH_FAILED` | Network-level failure reaching the target (DNS, connection refused, etc.) |
| 504 | `UPSTREAM_TIMEOUT` | Target did not respond within `FETCH_TIMEOUT_MS` |
| 500 | `INTERNAL_ERROR` | Unexpected server error (details never leaked to the client in production) |

---

## Production Concerns

- **Request timeout** — outbound fetches are bounded by `FETCH_TIMEOUT_MS`; per-link broken-link checks by `BROKEN_LINK_TIMEOUT_MS`.
- **Structured JSON error handling** — see [Error Format](#error-format) above.
- **Concurrency limits** — `p-limit` gate in `audit.service.ts` caps simultaneous outbound scrapes at `MAX_CONCURRENT_AUDITS`, independent of inbound HTTP load.
- **Caching** — Redis-first, automatic in-memory fallback (`cache.service.ts`), keyed by a hash of the normalized URL + broken-link flag, TTL from `CACHE_TTL_SECONDS`.
- **Per-IP rate limiting** — `express-rate-limit`, applied to the audit endpoint, configurable window/max.
- **Request IDs** — every request gets a UUID (or reuses an inbound `X-Request-Id`), present in logs and in every response (success or error).
- **Structured logging** — `pino` + `pino-http`, JSON in production, pretty-printed in development.
- **Security middleware** — `helmet` (secure headers), `cors` (configurable allowlist), strict SSRF-aware URL validation, small body-size limit (32kb) on the JSON parser.
- **Compression** — gzip via `compression`.
- **Graceful shutdown** — `SIGTERM`/`SIGINT` handlers drain in-flight requests and close the cache connection before exit (important for zero-downtime deploys on Render).

---

## Testing

```bash
npm test               # run all tests
npm run test:coverage  # with coverage report
```

- **Unit tests** (`tests/unit`) cover pure logic: URL validation/SSRF checks, SEO rule evaluation — no network, no Express.
- **Integration tests** (`tests/integration`) drive the real Express app via Supertest, with all outbound HTTP mocked via `nock` (tests never touch the real internet). Covers: successful audits, cache-hit behavior, validation errors, upstream error propagation, and timeouts.

## CI/CD

[`.github/workflows/ci.yml`](./.github/workflows/ci.yml) runs on every push/PR to `main`:
lint → typecheck → test (with coverage) → build, matrixed across Node 18.x and 20.x.

---

## Deployment (Render)

This repo includes [`render.yaml`](./render.yaml) for one-click Blueprint deployment.

**Steps:**

1. Push this repository to GitHub.
2. In the Render dashboard: **New → Blueprint**, connect the repo. Render will read `render.yaml` and provision the web service automatically.
3. If you want Redis caching in production, provision a Render Redis instance (or any managed Redis) and set the `REDIS_URL` environment variable in the Render dashboard — the service auto-detects it on next deploy and falls back to in-memory caching if it's absent or unreachable.
4. Render runs `npm ci && npm run build` to build, then `npm start` to run `dist/server.js`.
5. Render's health checks hit `GET /api/v1/health`.

**Manual setup (without the Blueprint), if preferred:**

- Build command: `npm ci && npm run build`
- Start command: `npm start`
- Health check path: `/api/v1/health`
- Add the environment variables listed above via the Render dashboard.

---

## Project Structure

```
src/
  config/        # env parsing, logger setup — the only place process.env is read
  controllers/    # thin HTTP layer: parse req, call service, shape response
  services/       # business logic: scraping/parsing, caching, orchestration
  middlewares/    # requestId, validation, rate limiting, error handling
  routes/         # route → controller wiring
  utils/          # pure, testable helpers (URL validation, SEO rules, ApiError)
  types/          # shared TS interfaces (the API contract)
  app.ts          # builds the Express app (no listen())
  server.ts       # binds the port, graceful shutdown
tests/
  unit/           # pure-function tests, no network/Express
  integration/    # Supertest + nock, full HTTP surface
.github/workflows/ci.yml
render.yaml
```

---

*Built for Digital Heroes Training Task*
