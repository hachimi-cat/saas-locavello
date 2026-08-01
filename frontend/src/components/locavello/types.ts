/**
 * Client-side types for the Locavello engine API. These mirror the
 * backend route payloads (backend/src/routes/*) — the backend is the
 * source of truth; keep these in sync when routes change.
 */

export type ProjectMode = 'sdk' | 'proxy';
export type ReviewPolicy = 'standard' | 'gated';
export type TranslationStatus = 'machine' | 'needs_review' | 'approved' | 'rejected';
export type WritableStatus = 'machine' | 'needs_review' | 'approved';

export interface Project {
  id: string;
  accountId: string;
  slug: string;
  name: string;
  sourceLocale: string;
  mode: ProjectMode;
  siteUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

/** ProjectLocale + the completion counters from `localeStats`. */
export interface LocaleStat {
  id: string;
  projectId: string;
  tag: string;
  fallback: string | null;
  rtl: boolean;
  enabled: boolean;
  keyCount: number;
  approved: number;
  machine: number;
  needsReview: number;
  missing: number;
}

export interface Namespace {
  id: string;
  projectId: string;
  name: string;
  reviewPolicy: ReviewPolicy;
}

export interface LastRelease {
  id: string;
  locale: string;
  createdAt: string;
  keyCount: number;
}

/** GET /projects/:id */
export interface ProjectDetail extends Project {
  locales: LocaleStat[];
  namespaces: Namespace[];
  lastRelease: LastRelease | null;
}

export interface Translation {
  id: string;
  keyId: string;
  locale: string;
  value: string;
  status: TranslationStatus;
  author: string | null;
  reviewedBy: string | null;
  rejectedReason: string | null;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface KeyUsage {
  file: string;
  line: number;
}

export interface KeyContext {
  usages?: KeyUsage[];
  [k: string]: unknown;
}

/** GET /projects/:id/keys row. `translations` holds only the requested
 *  locale's row when the query passed ?locale=. */
export interface KeyRow {
  id: string;
  projectId: string;
  namespaceId: string;
  name: string;
  sourceText: string;
  description: string | null;
  screenshotUrl: string | null;
  maxLength: number | null;
  placeholders: string[];
  context: KeyContext;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  namespace: { name: string; reviewPolicy: ReviewPolicy };
  translations: Translation[];
}

/** PUT /keys/:keyId/translations/:locale response. */
export interface SavedTranslation extends Translation {
  lengthWarning: { maxLength: number; estimated: number } | null;
}

/** GET /projects/:id/review-queue row. */
export interface ReviewRow extends Translation {
  key: {
    id: string;
    name: string;
    sourceText: string;
    description: string | null;
    screenshotUrl: string | null;
    maxLength: number | null;
    placeholders: string[];
    context: KeyContext;
    namespace: { name: string; reviewPolicy: ReviewPolicy };
  };
}

/** GET /projects/:id/releases row. */
export interface Release {
  id: string;
  locale: string;
  contentHash: string;
  keyCount: number;
  createdBy: string | null;
  createdAt: string;
}

/** POST /projects/:id/releases — 200 replays carry unchanged:true. */
export interface PublishedRelease extends Release {
  unchanged?: boolean;
}

/** GET /projects/releases/:a/diff/:b */
export interface ReleaseDiff {
  a: { id: string; hash: string };
  b: { id: string; hash: string };
  added: string[];
  removed: string[];
  changed: Array<{ key: string; from: string; to: string }>;
}

export interface CheckIssue {
  type: string;
  locale?: string;
  key?: string;
  missing?: string[];
  extra?: string[];
  maxLength?: number;
  estimated?: number;
  term?: string;
  status?: string;
  [k: string]: unknown;
}

/** GET /projects/:id/check */
export interface CheckReport {
  ok: boolean;
  errors: CheckIssue[];
  warnings: CheckIssue[];
  stats: { keys: number; locales: number };
}

export interface GlossaryTerm {
  id: string;
  accountId: string;
  projectId: string | null;
  term: string;
  locale: string | null;
  /** null (with null locale) = do-not-translate. */
  translation: string | null;
  note: string | null;
}

export interface TmEntry {
  id: string;
  accountId: string;
  projectId: string | null;
  sourceLocale: string;
  targetLocale: string;
  sourceText: string;
  sourceHash: string;
  targetText: string;
  quality: 'approved' | 'machine';
  createdAt: string;
  updatedAt: string;
}

/** GET /tm/suggest */
export interface TmSuggestions {
  exact: TmEntry | null;
  fuzzy: TmEntry[];
}

export type JobKind = 'machine_pass' | 'preview' | 'crawl';
export type JobStatus = 'queued' | 'running' | 'done' | 'failed';

/** TranslationJob stats — machine_pass carries the estimate up front
 *  ({estimatedKeys, estimatedWords}) and the worker fills
 *  {requested, fromTm, translated, rejectedByGate, words}; crawl jobs
 *  fill {pages, errors, strings, newKeys}. */
export interface JobStats {
  estimatedKeys?: number;
  estimatedWords?: number;
  requested?: number;
  fromTm?: number;
  translated?: number;
  rejectedByGate?: number;
  words?: number;
  pages?: number;
  errors?: number;
  strings?: number;
  newKeys?: number;
  [k: string]: unknown;
}

/** GET /projects/:id/jobs row. */
export interface TranslationJob {
  id: string;
  accountId: string;
  projectId: string | null;
  locale: string | null;
  kind: JobKind;
  status: JobStatus;
  stats: JobStats;
  error: string | null;
  requestedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** POST /projects/:id/translate | /crawl — 200 replays carry alreadyQueued. */
export interface QueuedJob extends TranslationJob {
  alreadyQueued?: boolean;
}

/** GET /projects/:id/pages row (Mode B). */
export interface SitePage {
  id: string;
  projectId: string;
  path: string;
  status: 'discovered' | 'crawled' | 'error';
  keyCount: number;
  lastCrawledAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/** POST /api-keys — plaintext appears exactly once, here. */
export interface MintedApiKey extends ApiKeyRow {
  plaintext: string;
}
