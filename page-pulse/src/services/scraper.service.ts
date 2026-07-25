import axios, { AxiosError } from 'axios';
import * as cheerio from 'cheerio';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { ApiError } from '../utils/ApiError';
import { analyzeSeoIssues } from '../utils/seo.util';
import { assertResolvesToPublicAddress, isInternalLink, resolveHref } from '../utils/url.util';
import { AuditReport, BrokenLinkResult } from '../types';

interface ScrapeOptions {
  checkBrokenLinks: boolean;
}

/**
 * Fetches a single page and returns its HTTP status + raw HTML + timing.
 * Isolated from parsing so timeout/network-error handling stays in one
 * place and is independently testable.
 */
async function fetchPage(url: string): Promise<{ html: string; status: number; finalUrl: string; contentLengthBytes: number; responseTimeMs: number }> {
  await assertResolvesToPublicAddress(new URL(url).hostname).catch((err: Error) => {
    throw ApiError.badRequest(err.message);
  });

  const startedAt = process.hrtime.bigint();

  try {
    const response = await axios.get<string>(url, {
      timeout: env.FETCH_TIMEOUT_MS,
      maxRedirects: env.FETCH_MAX_REDIRECTS,
      maxContentLength: env.FETCH_MAX_CONTENT_BYTES,
      responseType: 'text',
      validateStatus: () => true, // we handle non-2xx ourselves, don't throw
      headers: {
        'User-Agent': env.USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    const responseTimeMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const finalUrl = (response.request?.res?.responseUrl as string | undefined) || url;
    const contentLengthBytes = Buffer.byteLength(response.data || '', 'utf8');

    if (response.status >= 400) {
      throw new ApiError(
        response.status,
        'TARGET_RETURNED_ERROR',
        `Target site responded with HTTP ${response.status}.`,
      );
    }

    return {
      html: response.data,
      status: response.status,
      finalUrl,
      contentLengthBytes,
      responseTimeMs: Math.round(responseTimeMs),
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;

    const axiosErr = err as AxiosError;
    if (axiosErr.code === 'ECONNABORTED') {
      throw ApiError.gatewayTimeout(`Request to target URL timed out after ${env.FETCH_TIMEOUT_MS}ms.`);
    }
    if (axiosErr.code === 'ENOTFOUND' || axiosErr.code === 'EAI_AGAIN') {
      throw ApiError.badRequest('Could not resolve the target hostname. Check the URL and try again.');
    }
    if (axiosErr.code === 'ECONNREFUSED') {
      throw ApiError.badGateway('Target server refused the connection.');
    }
    logger.error({ err: axiosErr.message, code: axiosErr.code }, 'Unhandled fetch error');
    throw ApiError.badGateway('Failed to fetch the target URL.', { reason: axiosErr.message });
  }
}

/** Performs a lightweight HEAD (falling back to GET) check against a single link. */
async function checkLink(url: string): Promise<BrokenLinkResult> {
  try {
    let response = await axios.head(url, {
      timeout: env.BROKEN_LINK_TIMEOUT_MS,
      maxRedirects: env.FETCH_MAX_REDIRECTS,
      validateStatus: () => true,
      headers: { 'User-Agent': env.USER_AGENT },
    });

    // Some servers reject HEAD; retry with GET before declaring it broken.
    if (response.status === 405 || response.status === 501) {
      response = await axios.get(url, {
        timeout: env.BROKEN_LINK_TIMEOUT_MS,
        maxRedirects: env.FETCH_MAX_REDIRECTS,
        validateStatus: () => true,
        headers: { 'User-Agent': env.USER_AGENT },
        responseType: 'stream',
      });
    }

    return { url, status: response.status, ok: response.status < 400 };
  } catch (err) {
    const axiosErr = err as AxiosError;
    return {
      url,
      status: null,
      ok: false,
      error: axiosErr.code === 'ECONNABORTED' ? 'timeout' : axiosErr.code || 'request_failed',
    };
  }
}

/**
 * Fetches the given URL and produces a full audit report (minus the
 * cache metadata, which the orchestrating audit.service attaches).
 */
export async function scrapeAndAnalyze(
  url: string,
  options: ScrapeOptions,
): Promise<Omit<AuditReport, 'cache' | 'requestedUrl'>> {
  const { html, status, finalUrl, contentLengthBytes, responseTimeMs } = await fetchPage(url);

  const $ = cheerio.load(html);

  const title = $('title').first().text().trim() || null;
  const metaDescription =
    $('meta[name="description"]').attr('content')?.trim() ||
    $('meta[property="og:description"]').attr('content')?.trim() ||
    null;
  const canonicalUrl = $('link[rel="canonical"]').attr('href')?.trim() || null;
  const h1Count = $('h1').length;

  const images = $('img');
  const imageCount = images.length;
  let imagesMissingAlt = 0;
  images.each((_, el) => {
    const alt = $(el).attr('alt');
    if (alt === undefined || alt.trim() === '') imagesMissingAlt += 1;
  });

  const linkSet = new Set<string>();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    const resolved = href ? resolveHref(href, finalUrl) : null;
    if (resolved) linkSet.add(resolved);
  });

  let internal = 0;
  let external = 0;
  const uniqueLinks = Array.from(linkSet);
  for (const link of uniqueLinks) {
    if (isInternalLink(link, finalUrl)) internal += 1;
    else external += 1;
  }

  const seoIssues = analyzeSeoIssues({
    $,
    title,
    metaDescription,
    canonicalUrl,
    imageCount,
    imagesMissingAlt,
    h1Count,
  });

  let brokenLinks: BrokenLinkResult[] | null = null;
  if (options.checkBrokenLinks && uniqueLinks.length > 0) {
    const linksToCheck = uniqueLinks.slice(0, env.MAX_LINKS_TO_CHECK);
    const results = await Promise.all(linksToCheck.map((link) => checkLink(link)));
    brokenLinks = results.filter((r) => !r.ok);
  }

  return {
    finalUrl,
    httpStatus: status,
    title,
    metaDescription,
    canonicalUrl,
    imageCount,
    links: { internal, external, total: uniqueLinks.length },
    responseTimeMs,
    contentLengthBytes,
    seoIssues,
    brokenLinks,
    fetchedAt: new Date().toISOString(),
  };
}
