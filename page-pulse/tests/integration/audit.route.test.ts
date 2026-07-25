import request from 'supertest';
import nock from 'nock';
import { createApp } from '../../src/app';

const app = createApp();

const SAMPLE_HTML = `
<!DOCTYPE html>
<html>
  <head>
    <title>Example Domain - A Sample Page For Testing</title>
    <meta name="description" content="This is a sample meta description used purely for integration testing purposes and is long enough." />
    <link rel="canonical" href="https://example.com/" />
  </head>
  <body>
    <h1>Welcome to Example</h1>
    <img src="/logo.png" alt="Logo" />
    <img src="/banner.png" />
    <a href="/about">About</a>
    <a href="/contact">Contact</a>
    <a href="https://external-site.com/page">External</a>
    <a href="mailto:hello@example.com">Email us</a>
  </body>
</html>
`;

describe('GET / (static browser UI)', () => {
  it('serves the bundled HTML test page', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('Page Pulse');
  });
});

describe('GET /api/v1/health', () => {
  it('returns 200 with an ok status', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.headers['x-request-id']).toBeDefined();
  });
});

describe('POST /api/v1/audit', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('returns a full audit report for a valid, reachable URL', async () => {
    nock('https://example.com').get('/').reply(200, SAMPLE_HTML, { 'Content-Type': 'text/html' });

    const res = await request(app).post('/api/v1/audit').send({ url: 'https://example.com/' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const { data } = res.body;
    expect(data.title).toBe('Example Domain - A Sample Page For Testing');
    expect(data.canonicalUrl).toBe('https://example.com/');
    expect(data.imageCount).toBe(2);
    expect(data.links.internal).toBe(2);
    expect(data.links.external).toBe(1);
    expect(data.httpStatus).toBe(200);
    expect(typeof data.responseTimeMs).toBe('number');
    expect(data.contentLengthBytes).toBeGreaterThan(0);
    expect(data.cache.hit).toBe(false);
    expect(Array.isArray(data.seoIssues)).toBe(true);
    // one <img> without alt -> IMAGES_MISSING_ALT should be present
    expect(data.seoIssues.some((i: { code: string }) => i.code === 'IMAGES_MISSING_ALT')).toBe(true);
    expect(res.headers['x-request-id']).toBe(res.body.requestId);
  });

  it('serves a cached response on the second identical request', async () => {
    const scope = nock('https://example.com')
      .get('/cached-page')
      .reply(200, SAMPLE_HTML, { 'Content-Type': 'text/html' });

    const first = await request(app).post('/api/v1/audit').send({ url: 'https://example.com/cached-page' });
    expect(first.status).toBe(200);
    expect(first.body.data.cache.hit).toBe(false);

    const second = await request(app).post('/api/v1/audit').send({ url: 'https://example.com/cached-page' });
    expect(second.status).toBe(200);
    expect(second.body.data.cache.hit).toBe(true);

    // Only one real HTTP call should have occurred - the second was served from cache.
    expect(scope.isDone()).toBe(true);
  });

  it('rejects a missing url with 400 and structured error body', async () => {
    const res = await request(app).post('/api/v1/audit').send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    expect(res.body.requestId).toBeDefined();
  });

  it('rejects a malformed URL with 400', async () => {
    const res = await request(app).post('/api/v1/audit').send({ url: 'not-a-url' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('rejects a URL targeting a private IP address', async () => {
    const res = await request(app).post('/api/v1/audit').send({ url: 'http://192.168.1.1/admin' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/private|reserved/i);
  });

  it('rejects unsupported protocols', async () => {
    const res = await request(app).post('/api/v1/audit').send({ url: 'ftp://example.com/file.txt' });
    expect(res.status).toBe(400);
  });

  it('propagates a non-2xx target response as a structured error', async () => {
    nock('https://example.com').get('/missing').reply(404, 'Not Found');

    const res = await request(app).post('/api/v1/audit').send({ url: 'https://example.com/missing' });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('TARGET_RETURNED_ERROR');
  });

  it('returns 504 when the target times out', async () => {
    nock('https://example.com')
      .get('/slow')
      .delay(6000)
      .reply(200, SAMPLE_HTML);

    const res = await request(app).post('/api/v1/audit').send({ url: 'https://example.com/slow' });

    expect(res.status).toBe(504);
    expect(res.body.error.code).toBe('UPSTREAM_TIMEOUT');
  }, 10000);
});

describe('404 handling', () => {
  it('returns a structured error for unknown routes', async () => {
    const res = await request(app).get('/this-route-does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
