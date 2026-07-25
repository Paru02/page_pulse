import type { CheerioAPI } from 'cheerio';
import { SeoIssue } from '../types';

const TITLE_MIN_LENGTH = 10;
const TITLE_MAX_LENGTH = 60;
const META_DESC_MIN_LENGTH = 50;
const META_DESC_MAX_LENGTH = 160;

/**
 * Runs a set of well-known, non-controversial on-page SEO checks.
 * Each rule is isolated so new rules can be added without touching
 * existing ones, and so each rule can be unit tested independently.
 */
export function analyzeSeoIssues(params: {
  $: CheerioAPI;
  title: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  imageCount: number;
  imagesMissingAlt: number;
  h1Count: number;
}): SeoIssue[] {
  const { title, metaDescription, canonicalUrl, imagesMissingAlt, h1Count } = params;
  const issues: SeoIssue[] = [];

  if (!title || title.trim().length === 0) {
    issues.push({
      code: 'MISSING_TITLE',
      severity: 'error',
      message: 'Page is missing a <title> tag, which is critical for SEO and search result display.',
    });
  } else if (title.length < TITLE_MIN_LENGTH) {
    issues.push({
      code: 'TITLE_TOO_SHORT',
      severity: 'warning',
      message: `Title is only ${title.length} characters. Aim for ${TITLE_MIN_LENGTH}-${TITLE_MAX_LENGTH} characters.`,
    });
  } else if (title.length > TITLE_MAX_LENGTH) {
    issues.push({
      code: 'TITLE_TOO_LONG',
      severity: 'warning',
      message: `Title is ${title.length} characters and may be truncated in search results (recommended max ${TITLE_MAX_LENGTH}).`,
    });
  }

  if (!metaDescription || metaDescription.trim().length === 0) {
    issues.push({
      code: 'MISSING_META_DESCRIPTION',
      severity: 'error',
      message: 'Page is missing a meta description, reducing control over search result snippets.',
    });
  } else if (metaDescription.length < META_DESC_MIN_LENGTH) {
    issues.push({
      code: 'META_DESCRIPTION_TOO_SHORT',
      severity: 'warning',
      message: `Meta description is only ${metaDescription.length} characters. Aim for ${META_DESC_MIN_LENGTH}-${META_DESC_MAX_LENGTH}.`,
    });
  } else if (metaDescription.length > META_DESC_MAX_LENGTH) {
    issues.push({
      code: 'META_DESCRIPTION_TOO_LONG',
      severity: 'warning',
      message: `Meta description is ${metaDescription.length} characters and may be truncated (recommended max ${META_DESC_MAX_LENGTH}).`,
    });
  }

  if (!canonicalUrl) {
    issues.push({
      code: 'MISSING_CANONICAL',
      severity: 'warning',
      message: 'Page does not declare a canonical URL, which can lead to duplicate-content issues.',
    });
  }

  if (h1Count === 0) {
    issues.push({
      code: 'MISSING_H1',
      severity: 'error',
      message: 'Page has no <h1> heading, which harms content structure and accessibility.',
    });
  } else if (h1Count > 1) {
    issues.push({
      code: 'MULTIPLE_H1',
      severity: 'info',
      message: `Page has ${h1Count} <h1> tags. Best practice is exactly one per page.`,
    });
  }

  if (imagesMissingAlt > 0) {
    issues.push({
      code: 'IMAGES_MISSING_ALT',
      severity: 'warning',
      message: `${imagesMissingAlt} image(s) are missing "alt" attributes, harming accessibility and image SEO.`,
    });
  }

  return issues;
}
