import { validateUrlSyntax, resolveHref, isInternalLink } from '../../src/utils/url.util';

describe('validateUrlSyntax', () => {
  it('accepts a well-formed https URL', () => {
    const result = validateUrlSyntax('https://example.com/page');
    expect(result.valid).toBe(true);
    expect(result.normalizedUrl).toBe('https://example.com/page');
  });

  it('accepts a well-formed http URL', () => {
    const result = validateUrlSyntax('http://example.com');
    expect(result.valid).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(validateUrlSyntax('').valid).toBe(false);
  });

  it('rejects a non-URL string', () => {
    expect(validateUrlSyntax('not a url').valid).toBe(false);
  });

  it('rejects unsupported protocols like ftp', () => {
    const result = validateUrlSyntax('ftp://example.com/file.txt');
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/protocol/i);
  });

  it('rejects javascript: pseudo-protocol', () => {
    expect(validateUrlSyntax('javascript:alert(1)').valid).toBe(false);
  });

  it('rejects localhost', () => {
    expect(validateUrlSyntax('http://localhost:3000').valid).toBe(false);
  });

  it('rejects loopback IP 127.0.0.1', () => {
    expect(validateUrlSyntax('http://127.0.0.1').valid).toBe(false);
  });

  it('rejects private IP range 192.168.x.x', () => {
    expect(validateUrlSyntax('http://192.168.1.1').valid).toBe(false);
  });

  it('rejects cloud metadata IP 169.254.169.254', () => {
    expect(validateUrlSyntax('http://169.254.169.254/latest/meta-data').valid).toBe(false);
  });

  it('rejects URLs longer than 2048 characters', () => {
    const longUrl = `https://example.com/${'a'.repeat(2100)}`;
    expect(validateUrlSyntax(longUrl).valid).toBe(false);
  });
});

describe('resolveHref', () => {
  const base = 'https://example.com/blog/post-1';

  it('resolves a relative path against the base URL', () => {
    expect(resolveHref('/about', base)).toBe('https://example.com/about');
  });

  it('resolves a protocol-relative URL', () => {
    expect(resolveHref('//cdn.example.com/x.js', base)).toBe('https://cdn.example.com/x.js');
  });

  it('returns null for mailto links', () => {
    expect(resolveHref('mailto:test@example.com', base)).toBeNull();
  });

  it('returns null for javascript: links', () => {
    expect(resolveHref('javascript:void(0)', base)).toBeNull();
  });

  it('returns null for empty hrefs and pure fragments', () => {
    expect(resolveHref('', base)).toBeNull();
    expect(resolveHref('#section', base)).toBeNull();
  });
});

describe('isInternalLink', () => {
  it('treats same-host links as internal', () => {
    expect(isInternalLink('https://example.com/other-page', 'https://example.com/page')).toBe(true);
  });

  it('treats www vs non-www of the same domain as internal', () => {
    expect(isInternalLink('https://www.example.com/page', 'https://example.com/page')).toBe(true);
  });

  it('treats a different host as external', () => {
    expect(isInternalLink('https://other.com/page', 'https://example.com/page')).toBe(false);
  });
});
