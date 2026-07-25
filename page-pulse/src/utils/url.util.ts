import net from 'net';
import dns from 'dns';
import { promisify } from 'util';

const dnsLookup = promisify(dns.lookup);

export interface UrlValidationResult {
  valid: boolean;
  reason?: string;
  normalizedUrl?: string;
}

/**
 * Private / reserved IP ranges we refuse to fetch, to prevent this service
 * from being used as an SSRF proxy against internal infrastructure
 * (e.g. cloud metadata endpoints, internal admin panels).
 */
function isPrivateOrReservedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const octets = ip.split('.').map(Number);
    const [a, b] = octets;
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local / cloud metadata (169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 0) return true; // 0.0.0.0/8
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    return lower === '::1' || lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd');
  }
  return false;
}

/**
 * Syntactic validation: correct scheme, parseable URL, has a hostname.
 * This is fast and synchronous - suitable for the request-validation
 * middleware layer.
 */
export function validateUrlSyntax(rawUrl: string): UrlValidationResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, reason: 'URL is required and must be a string.' };
  }

  const trimmed = rawUrl.trim();
  if (trimmed.length === 0) {
    return { valid: false, reason: 'URL must not be empty.' };
  }
  if (trimmed.length > 2048) {
    return { valid: false, reason: 'URL exceeds maximum allowed length of 2048 characters.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, reason: 'URL is not well-formed. Include a scheme, e.g. https://example.com' };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { valid: false, reason: `Unsupported protocol "${parsed.protocol}". Only http and https are allowed.` };
  }

  if (!parsed.hostname) {
    return { valid: false, reason: 'URL must include a hostname.' };
  }

  const lowerHost = parsed.hostname.toLowerCase();
  if (lowerHost === 'localhost' || lowerHost.endsWith('.localhost') || lowerHost === '0.0.0.0') {
    return { valid: false, reason: 'Requests to localhost are not permitted.' };
  }

  // If the hostname is a literal IP, check it immediately.
  if (net.isIP(lowerHost) && isPrivateOrReservedIp(lowerHost)) {
    return { valid: false, reason: 'Requests to private or reserved IP ranges are not permitted.' };
  }

  return { valid: true, normalizedUrl: parsed.toString() };
}

/**
 * DNS-level validation: resolves the hostname and rejects it if it points
 * to a private/reserved IP. This catches DNS-rebinding style attempts
 * (e.g. a public domain name that resolves to 169.254.169.254) that
 * syntactic validation alone cannot catch. Called right before the
 * outbound fetch, not in the request-validation middleware, since it
 * requires a network round trip.
 */
export async function assertResolvesToPublicAddress(hostname: string): Promise<void> {
  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new Error('Target resolves to a private or reserved IP address.');
    }
    return;
  }

  try {
    const { address } = await dnsLookup(hostname);
    if (isPrivateOrReservedIp(address)) {
      throw new Error('Target hostname resolves to a private or reserved IP address.');
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('private or reserved')) {
      throw err;
    }
    throw new Error(`Unable to resolve hostname "${hostname}".`);
  }
}

/**
 * Resolves a relative or protocol-relative href against a base URL,
 * returning null for hrefs that aren't fetchable web resources
 * (mailto:, tel:, javascript:, #fragments, empty).
 */
export function resolveHref(href: string, baseUrl: string): string | null {
  if (!href) return null;
  const trimmed = href.trim();
  if (
    trimmed === '' ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('tel:') ||
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('data:')
  ) {
    return null;
  }
  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return null;
  }
}

/** True if `link` shares the same registrable host as `baseUrl`. */
export function isInternalLink(link: string, baseUrl: string): boolean {
  try {
    const linkHost = new URL(link).hostname.replace(/^www\./, '');
    const baseHost = new URL(baseUrl).hostname.replace(/^www\./, '');
    return linkHost === baseHost;
  } catch {
    return false;
  }
}
