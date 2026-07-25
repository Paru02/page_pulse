/**
 * Domain types shared across services, controllers and tests.
 * Keeping these in one place means the API response shape, the service
 * return type, and the test assertions can never silently drift apart.
 */

export interface SeoIssue {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface BrokenLinkResult {
  url: string;
  status: number | null;
  ok: boolean;
  error?: string;
}

export interface LinkCounts {
  internal: number;
  external: number;
  total: number;
}

export interface AuditReport {
  requestedUrl: string;
  finalUrl: string;
  httpStatus: number;
  title: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  imageCount: number;
  links: LinkCounts;
  responseTimeMs: number;
  contentLengthBytes: number;
  seoIssues: SeoIssue[];
  brokenLinks: BrokenLinkResult[] | null;
  fetchedAt: string;
  cache: {
    hit: boolean;
    ttlSeconds: number;
  };
}

export interface AuditRequestBody {
  url: string;
  checkBrokenLinks?: boolean;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId: string;
  timestamp: string;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  requestId: string;
  timestamp: string;
}
