import * as cheerio from 'cheerio';
import { analyzeSeoIssues } from '../../src/utils/seo.util';

function baseParams(overrides: Partial<Parameters<typeof analyzeSeoIssues>[0]> = {}) {
  const $ = cheerio.load('<html><body></body></html>');
  return {
    $,
    title: 'A Well Sized Page Title Here',
    metaDescription:
      'This is a perfectly reasonable meta description that sits comfortably between fifty and one hundred sixty characters long.',
    canonicalUrl: 'https://example.com/',
    imageCount: 2,
    imagesMissingAlt: 0,
    h1Count: 1,
    ...overrides,
  };
}

describe('analyzeSeoIssues', () => {
  it('returns no issues for a well-optimized page', () => {
    const issues = analyzeSeoIssues(baseParams());
    expect(issues).toHaveLength(0);
  });

  it('flags a missing title as an error', () => {
    const issues = analyzeSeoIssues(baseParams({ title: null }));
    expect(issues).toContainEqual(
      expect.objectContaining({ code: 'MISSING_TITLE', severity: 'error' }),
    );
  });

  it('flags a title that is too short', () => {
    const issues = analyzeSeoIssues(baseParams({ title: 'Hi' }));
    expect(issues).toContainEqual(expect.objectContaining({ code: 'TITLE_TOO_SHORT' }));
  });

  it('flags a title that is too long', () => {
    const issues = analyzeSeoIssues(baseParams({ title: 'A'.repeat(80) }));
    expect(issues).toContainEqual(expect.objectContaining({ code: 'TITLE_TOO_LONG' }));
  });

  it('flags a missing meta description as an error', () => {
    const issues = analyzeSeoIssues(baseParams({ metaDescription: null }));
    expect(issues).toContainEqual(
      expect.objectContaining({ code: 'MISSING_META_DESCRIPTION', severity: 'error' }),
    );
  });

  it('flags a missing canonical URL as a warning', () => {
    const issues = analyzeSeoIssues(baseParams({ canonicalUrl: null }));
    expect(issues).toContainEqual(expect.objectContaining({ code: 'MISSING_CANONICAL' }));
  });

  it('flags missing h1 as an error', () => {
    const issues = analyzeSeoIssues(baseParams({ h1Count: 0 }));
    expect(issues).toContainEqual(expect.objectContaining({ code: 'MISSING_H1', severity: 'error' }));
  });

  it('flags multiple h1s as info', () => {
    const issues = analyzeSeoIssues(baseParams({ h1Count: 3 }));
    expect(issues).toContainEqual(expect.objectContaining({ code: 'MULTIPLE_H1', severity: 'info' }));
  });

  it('flags images missing alt attributes', () => {
    const issues = analyzeSeoIssues(baseParams({ imagesMissingAlt: 4 }));
    const issue = issues.find((i) => i.code === 'IMAGES_MISSING_ALT');
    expect(issue).toBeDefined();
    expect(issue?.message).toMatch(/4 image/);
  });
});
