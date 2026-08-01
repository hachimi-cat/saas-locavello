/**
 * Locavello SDK — typed JS/TS client for the locavello.forjio.com REST
 * API. Sister to `forjio-locavello` (Python) and
 * `hachimi-cat/locavello-go` (Go).
 *
 * Auth = Bearer key — an `lv_live_…` API key from the dashboard. Pass
 * `apiKey` or set `LOCAVELLO_API_KEY`. The `public.*` surface (Mode B
 * preview + the catalog endpoint locavello.js reads) needs no key.
 *
 * Every response rides the Forjio envelope `{ data, error, meta }`;
 * the client unwraps it and throws `LocavelloError` (with the
 * envelope's `error.code`) on failure. Idempotent GETs retry
 * automatically on 429/502/503/504 and network errors (2 retries,
 * exponential backoff); writes never retry.
 */

// ─── Envelope + error ─────────────────────────────────────────────────

export interface ApiEnvelope<T> {
  data: T | null;
  error: { code: string; message: string; param?: string; docUrl?: string } | null;
  meta?: {
    requestId: string;
    timestamp: string;
    cursor?: string | null;
    hasMore?: boolean;
  };
}

export class LocavelloError extends Error {
  /** HTTP status (0 for transport-level failures). */
  readonly status: number;
  /** Envelope `error.code` (UPPER_SNAKE_CASE) or an SDK-side code
   *  (`NETWORK_ERROR`, `TIMEOUT`, `INVALID_RESPONSE`, `AUTH_REQUIRED`). */
  readonly code: string;
  readonly requestId: string | undefined;
  readonly param: string | undefined;

  constructor(status: number, code: string, message: string, requestId?: string, param?: string) {
    super(message);
    this.name = 'LocavelloError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.param = param;
  }
}

// ─── Pagination ───────────────────────────────────────────────────────

/** One page of a cursored list. `cursor` is opaque; null on the last page. */
export interface Page<T> {
  data: T[];
  cursor: string | null;
  hasMore: boolean;
}

/**
 * Walk a cursored list to exhaustion, yielding items.
 *
 * @example
 *   for await (const p of paginate((cursor) => client.projects.list({ cursor }))) { … }
 */
export async function* paginate<T>(
  fetch: (cursor?: string) => Promise<Page<T>>,
): AsyncGenerator<T, void, undefined> {
  let cursor: string | undefined;
  for (;;) {
    const page = await fetch(cursor);
    yield* page.data;
    if (!page.hasMore || page.cursor === null) return;
    cursor = page.cursor;
  }
}

// ─── Domain types ─────────────────────────────────────────────────────

export type ProjectMode = 'sdk' | 'proxy';
export type ReviewPolicy = 'standard' | 'gated';
export type TranslationStatus = 'machine' | 'needs_review' | 'approved' | 'rejected';
export type JobKind = 'machine_pass' | 'crawl' | 'preview';
export type JobStatus = 'queued' | 'running' | 'done' | 'failed';
export type BillingTier = 'free' | 'starter' | 'pro' | 'scale';

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

/** A target locale with per-status completion counts. */
export interface ProjectLocaleStat {
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

export interface ProjectLocale {
  id: string;
  projectId: string;
  tag: string;
  fallback: string | null;
  rtl: boolean;
  enabled: boolean;
}

export interface Namespace {
  id: string;
  projectId: string;
  name: string;
  reviewPolicy: ReviewPolicy;
}

export interface ProjectDetail extends Project {
  locales: ProjectLocaleStat[];
  namespaces: Namespace[];
  lastRelease: { id: string; locale: string; createdAt: string; keyCount: number } | null;
}

/** One key in a bulk upsert. Namespace defaults to 'default' (bare keys). */
export interface KeyInput {
  namespace?: string;
  name: string;
  sourceText: string;
  description?: string | null;
  maxLength?: number | null;
  context?: Record<string, unknown>;
}

export interface UpsertKeysResult {
  created: number;
  updated: number;
  archived: number;
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

export interface Key {
  id: string;
  projectId: string;
  namespaceId: string;
  name: string;
  sourceText: string;
  description: string | null;
  maxLength: number | null;
  screenshotUrl?: string | null;
  context: Record<string, unknown>;
  placeholders: string[];
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  namespace: { name: string; reviewPolicy: ReviewPolicy };
  translations: Translation[];
}

export interface KeyListParams {
  namespace?: string;
  /** Substring match on name/sourceText. */
  q?: string;
  /** Filter by translation state for this locale (with `status`). */
  locale?: string;
  /** 'missing' | 'machine' | 'needs_review' | 'approved' | 'rejected'. */
  status?: string;
  /** Include archived keys. */
  archived?: boolean;
  limit?: number;
  cursor?: string;
}

export interface SetTranslationResult extends Translation {
  lengthWarning: { maxLength: number; estimated: number } | null;
}

export interface ReviewItem extends Translation {
  key: {
    id: string;
    name: string;
    sourceText: string;
    description: string | null;
    screenshotUrl: string | null;
    maxLength: number | null;
    placeholders: string[];
    context: Record<string, unknown>;
    namespace: { name: string; reviewPolicy: ReviewPolicy };
  };
}

export interface Release {
  id: string;
  projectId: string;
  locale: string;
  contentHash: string;
  catalog: Record<string, string>;
  keyCount: number;
  createdBy: string | null;
  createdAt: string;
  /** Present when a publish was a no-op (same content hash). */
  unchanged?: boolean;
}

export interface ReleaseSummary {
  id: string;
  locale: string;
  contentHash: string;
  keyCount: number;
  createdBy: string | null;
  createdAt: string;
}

export interface PullResponse {
  projectId: string;
  sourceLocale: string;
  /** Source-locale catalog (key → source text). */
  source: Record<string, string>;
  locales: Record<
    string,
    { catalog: Record<string, string>; releaseId: string | null; contentHash: string }
  >;
  fallbacks: Record<string, string | null>;
}

export interface CheckIssue {
  type: string;
  locale: string;
  key: string;
  missing?: string[];
  extra?: string[];
  maxLength?: number;
  estimated?: number;
  term?: string;
  status?: string;
}

export interface CheckReport {
  ok: boolean;
  errors: CheckIssue[];
  warnings: CheckIssue[];
  stats: { keys: number; locales: number };
}

export interface ReleaseDiff {
  a: { id: string; hash: string };
  b: { id: string; hash: string };
  added: string[];
  removed: string[];
  changed: Array<{ key: string; from: string; to: string }>;
}

export interface TranslationJob {
  id: string;
  accountId: string;
  projectId: string | null;
  locale: string | null;
  kind: JobKind;
  status: JobStatus;
  stats: Record<string, unknown> | null;
  error: string | null;
  requestedBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** Present when a queue call found an existing queued/running job. */
  alreadyQueued?: boolean;
}

export interface SitePage {
  id: string;
  projectId: string;
  path: string;
  title: string | null;
  stringCount?: number;
  crawledAt?: string;
}

export interface GlossaryTerm {
  id: string;
  accountId: string;
  projectId: string | null;
  term: string;
  locale: string | null;
  /** Set with `locale` → forced translation; null → do-not-translate. */
  translation: string | null;
  note: string | null;
  createdAt: string;
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

export interface ApiKeySummary {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/** `plaintext` is returned ONCE at mint time — store it immediately. */
export interface ApiKeyCreated extends ApiKeySummary {
  accountId: string;
  createdBy: string | null;
  plaintext: string;
}

export interface TierDef {
  id: BillingTier;
  name: string;
  priceIdr: number;
  [k: string]: unknown;
}

export interface BillingInfo {
  subscription: {
    id: string | null;
    accountId: string;
    tier: BillingTier;
    status: string;
    plugipayCheckoutSessionId: string | null;
    currentPeriodEnd: string | null;
  };
  earlyAccess: boolean;
  usage: {
    projects: number;
    agentWords: { used: number; limit: number };
  };
  tiers: TierDef[];
}

export interface CheckoutResult {
  checkoutSessionId: string;
  /** Plugipay hosted checkout — redirect the browser here. */
  hostedUrl: string;
}

export interface PreviewStarted {
  previewId: string;
  url: string;
  targetLocale: string;
  stringsOnPage: number;
  previewedWords: number;
}

export interface PreviewResult {
  status: 'running' | 'done' | 'failed';
  url?: string;
  targetLocale?: string;
  pairs?: Array<{ original: string; translated: string }>;
  error?: string | null;
}

export interface PublicCatalog {
  projectId: string;
  locale: string;
  releaseId: string | null;
  enabledLocales: string[];
  sourceLocale: string;
  /** Fallback chain pre-flattened server-side — zero client logic. */
  catalog: Record<string, string>;
}

// ─── Client ───────────────────────────────────────────────────────────

export interface LocavelloClientOptions {
  /** `lv_live_…` API key. Defaults to `LOCAVELLO_API_KEY`. Optional —
   *  the `public.*` surface works without one. */
  apiKey?: string;
  /** Base URL override. Default `https://locavello.forjio.com`. */
  baseUrl?: string;
  /** Per-request fetch timeout. Default 30s. */
  timeoutMs?: number;
  /** Retry backoff base for idempotent GETs. Default 250ms. */
  retryBaseMs?: number;
}

interface FetchArgs {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /** Public endpoints skip the Authorization header entirely. */
  noAuth?: boolean;
}

/** Statuses worth a retry — throttles + transient upstream failures. */
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const MAX_RETRIES = 2;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class LocavelloClient {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retryBaseMs: number;

  constructor(opts: LocavelloClientOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.LOCAVELLO_API_KEY ?? undefined;
    this.baseUrl = (opts.baseUrl ?? 'https://locavello.forjio.com').replace(/\/+$/, '');
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.retryBaseMs = opts.retryBaseMs ?? 250;
  }

  /** Low-level call returning the FULL envelope (lists need meta). */
  private async requestEnvelope<T>(args: FetchArgs): Promise<ApiEnvelope<T>> {
    const url = new URL(this.baseUrl + args.path);
    for (const [k, v] of Object.entries(args.query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (!args.noAuth) {
      if (!this.apiKey) {
        throw new LocavelloError(
          0,
          'AUTH_REQUIRED',
          'No API key configured. Pass `apiKey` or set LOCAVELLO_API_KEY.',
        );
      }
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    if (args.body !== undefined) headers['Content-Type'] = 'application/json';

    // Idempotent GETs retry on throttles + transient upstream failures;
    // writes never do.
    const retryable = args.method === 'GET';
    let attempt = 0;
    for (;;) {
      let res: Response | undefined;
      let transportError: LocavelloError | undefined;
      try {
        res = await fetch(url, {
          method: args.method,
          headers,
          body: args.body !== undefined ? JSON.stringify(args.body) : undefined,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (e) {
        transportError =
          e instanceof Error && e.name === 'TimeoutError'
            ? new LocavelloError(0, 'TIMEOUT', `request timed out after ${this.timeoutMs}ms`)
            : new LocavelloError(0, 'NETWORK_ERROR', e instanceof Error ? e.message : String(e));
      }

      if (
        retryable &&
        attempt < MAX_RETRIES &&
        (transportError !== undefined || (res !== undefined && RETRYABLE_STATUSES.has(res.status)))
      ) {
        await sleep(this.retryBaseMs * 2 ** attempt);
        attempt += 1;
        continue;
      }
      if (transportError) throw transportError;
      const okRes = res!;

      let envelope: ApiEnvelope<T>;
      try {
        envelope = (await okRes.json()) as ApiEnvelope<T>;
      } catch {
        throw new LocavelloError(
          okRes.status,
          'INVALID_RESPONSE',
          `non-JSON response (HTTP ${okRes.status})`,
        );
      }

      if (!okRes.ok || envelope.error) {
        const err = envelope.error;
        throw new LocavelloError(
          okRes.status,
          err?.code ?? 'UNKNOWN',
          err?.message ?? `HTTP ${okRes.status}`,
          envelope.meta?.requestId,
          err?.param,
        );
      }
      return envelope;
    }
  }

  async request<T>(args: FetchArgs): Promise<T> {
    const envelope = await this.requestEnvelope<T>(args);
    return envelope.data as T;
  }

  /** List call — array in `data`, cursor/hasMore in `meta`. */
  private async requestPage<T>(args: FetchArgs): Promise<Page<T>> {
    const envelope = await this.requestEnvelope<T[]>(args);
    return {
      data: (envelope.data ?? []) as T[],
      cursor: envelope.meta?.cursor ?? null,
      hasMore: envelope.meta?.hasMore ?? false,
    };
  }

  // ─── Projects ──────────────────────────────────────────────────────

  readonly projects = {
    /** POST /api/v1/projects */
    create: (input: {
      slug: string;
      name: string;
      sourceLocale?: string;
      mode?: ProjectMode;
      /** Required for mode 'proxy'. */
      siteUrl?: string;
    }): Promise<Project> => this.request({ method: 'POST', path: '/api/v1/projects', body: input }),

    /** GET /api/v1/projects — newest-first, keyset cursor. */
    list: (params?: { limit?: number; cursor?: string }): Promise<Page<Project>> =>
      this.requestPage({
        method: 'GET',
        path: '/api/v1/projects',
        query: { limit: params?.limit, cursor: params?.cursor },
      }),

    /** GET /api/v1/projects/:id — detail incl. per-locale completion,
     *  namespaces, and the latest release. */
    get: (id: string): Promise<ProjectDetail> =>
      this.request({ method: 'GET', path: `/api/v1/projects/${encodeURIComponent(id)}` }),

    /** PATCH /api/v1/projects/:id */
    update: (id: string, patch: { name?: string; siteUrl?: string | null }): Promise<Project> =>
      this.request({
        method: 'PATCH',
        path: `/api/v1/projects/${encodeURIComponent(id)}`,
        body: patch,
      }),

    /** POST /api/v1/projects/:id/locales — add a target locale. */
    addLocale: (
      id: string,
      input: { tag: string; fallback?: string | null; rtl?: boolean },
    ): Promise<ProjectLocale> =>
      this.request({
        method: 'POST',
        path: `/api/v1/projects/${encodeURIComponent(id)}/locales`,
        body: input,
      }),

    /** PATCH /api/v1/projects/:id/locales/:tag */
    updateLocale: (
      id: string,
      tag: string,
      patch: { fallback?: string | null; rtl?: boolean; enabled?: boolean },
    ): Promise<ProjectLocale> =>
      this.request({
        method: 'PATCH',
        path: `/api/v1/projects/${encodeURIComponent(id)}/locales/${encodeURIComponent(tag)}`,
        body: patch,
      }),

    /** GET /api/v1/projects/:id/locales — per-locale completion stats
     *  (plain array, not cursored). */
    locales: (id: string): Promise<ProjectLocaleStat[]> =>
      this.request({ method: 'GET', path: `/api/v1/projects/${encodeURIComponent(id)}/locales` }),

    /** POST /api/v1/projects/:id/namespaces */
    addNamespace: (
      id: string,
      input: { name: string; reviewPolicy?: ReviewPolicy },
    ): Promise<Namespace> =>
      this.request({
        method: 'POST',
        path: `/api/v1/projects/${encodeURIComponent(id)}/namespaces`,
        body: input,
      }),

    /** PATCH /api/v1/projects/:id/namespaces/:name */
    updateNamespace: (
      id: string,
      name: string,
      patch: { reviewPolicy: ReviewPolicy },
    ): Promise<Namespace> =>
      this.request({
        method: 'PATCH',
        path: `/api/v1/projects/${encodeURIComponent(id)}/namespaces/${encodeURIComponent(name)}`,
        body: patch,
      }),
  };

  // ─── Keys ──────────────────────────────────────────────────────────

  readonly keys = {
    /** PUT /api/v1/projects/:id/keys — bulk upsert (max 2000 keys per
     *  request). With `prune`, keys of the SAME namespaces absent from
     *  the payload are archived — only pass it on a request carrying
     *  the complete picture. */
    upsert: (
      projectId: string,
      keys: KeyInput[],
      opts?: { prune?: boolean },
    ): Promise<UpsertKeysResult> =>
      this.request({
        method: 'PUT',
        path: `/api/v1/projects/${encodeURIComponent(projectId)}/keys`,
        body: { keys, prune: opts?.prune ?? false },
      }),

    /** GET /api/v1/projects/:id/keys — the workbench list. */
    list: (projectId: string, params?: KeyListParams): Promise<Page<Key>> =>
      this.requestPage({
        method: 'GET',
        path: `/api/v1/projects/${encodeURIComponent(projectId)}/keys`,
        query: {
          namespace: params?.namespace,
          q: params?.q,
          locale: params?.locale,
          status: params?.status,
          archived: params?.archived ? 'true' : undefined,
          limit: params?.limit,
          cursor: params?.cursor,
        },
      }),
  };

  // ─── Translations ──────────────────────────────────────────────────

  readonly translations = {
    /** PATCH /api/v1/keys/:keyId — key context metadata. */
    updateKey: (
      keyId: string,
      patch: {
        description?: string | null;
        maxLength?: number | null;
        screenshotUrl?: string | null;
      },
    ): Promise<Key> =>
      this.request({
        method: 'PATCH',
        path: `/api/v1/keys/${encodeURIComponent(keyId)}`,
        body: patch,
      }),

    /** PUT /api/v1/keys/:keyId/translations/:locale — write a
     *  translation. The placeholder-safety gate runs server-side on
     *  every write (422 PLACEHOLDER_MISMATCH on drops/renames). */
    set: (
      keyId: string,
      locale: string,
      input: { value: string; status?: Exclude<TranslationStatus, 'rejected'>; author?: string },
    ): Promise<SetTranslationResult> =>
      this.request({
        method: 'PUT',
        path: `/api/v1/keys/${encodeURIComponent(keyId)}/translations/${encodeURIComponent(locale)}`,
        body: input,
      }),

    /** GET /api/v1/projects/:id/review-queue — machine/flagged
     *  translations with reviewer context, oldest first. */
    reviewQueue: (
      projectId: string,
      params?: { locale?: string; limit?: number; cursor?: string },
    ): Promise<Page<ReviewItem>> =>
      this.requestPage({
        method: 'GET',
        path: `/api/v1/projects/${encodeURIComponent(projectId)}/review-queue`,
        query: { locale: params?.locale, limit: params?.limit, cursor: params?.cursor },
      }),

    /** POST /api/v1/translations/:id/approve */
    approve: (id: string): Promise<Translation> =>
      this.request({ method: 'POST', path: `/api/v1/translations/${encodeURIComponent(id)}/approve` }),

    /** POST /api/v1/translations/:id/reject */
    reject: (id: string, reason: string): Promise<Translation> =>
      this.request({
        method: 'POST',
        path: `/api/v1/translations/${encodeURIComponent(id)}/reject`,
        body: { reason },
      }),
  };

  // ─── Releases ──────────────────────────────────────────────────────

  readonly releases = {
    /** POST /api/v1/projects/:id/releases — publish. Idempotent on
     *  content: same catalog → the existing release with
     *  `unchanged: true`. */
    publish: (projectId: string, locale: string): Promise<Release> =>
      this.request({
        method: 'POST',
        path: `/api/v1/projects/${encodeURIComponent(projectId)}/releases`,
        body: { locale },
      }),

    /** GET /api/v1/projects/:id/releases */
    list: (
      projectId: string,
      params?: { locale?: string; limit?: number; cursor?: string },
    ): Promise<Page<ReleaseSummary>> =>
      this.requestPage({
        method: 'GET',
        path: `/api/v1/projects/${encodeURIComponent(projectId)}/releases`,
        query: { locale: params?.locale, limit: params?.limit, cursor: params?.cursor },
      }),

    /** GET /api/v1/projects/releases/:releaseId — the frozen catalog. */
    get: (releaseId: string): Promise<Release> =>
      this.request({
        method: 'GET',
        path: `/api/v1/projects/releases/${encodeURIComponent(releaseId)}`,
      }),

    /** GET /api/v1/projects/:id/pull — the CI endpoint: per-locale
     *  latest release catalogs (+ drafts with `draft`), the source
     *  catalog, and fallbacks. `pseudo` adds a synthesized en-XA. */
    pull: (
      projectId: string,
      params?: { draft?: boolean; pseudo?: boolean },
    ): Promise<PullResponse> =>
      this.request({
        method: 'GET',
        path: `/api/v1/projects/${encodeURIComponent(projectId)}/pull`,
        query: {
          draft: params?.draft ? 'true' : undefined,
          pseudo: params?.pseudo ? 'true' : undefined,
        },
      }),

    /** GET /api/v1/projects/:id/check — the CI gate report. Non-empty
     *  `errors` should fail the build. */
    check: (projectId: string): Promise<CheckReport> =>
      this.request({
        method: 'GET',
        path: `/api/v1/projects/${encodeURIComponent(projectId)}/check`,
      }),

    /** GET /api/v1/projects/releases/:a/diff/:b — key-level diff. */
    diff: (releaseA: string, releaseB: string): Promise<ReleaseDiff> =>
      this.request({
        method: 'GET',
        path: `/api/v1/projects/releases/${encodeURIComponent(releaseA)}/diff/${encodeURIComponent(releaseB)}`,
      }),
  };

  // ─── Jobs (agent translate + Mode B crawl) ─────────────────────────

  readonly jobs = {
    /** POST /api/v1/projects/:id/translate — queue a machine first
     *  pass. Returns the job with an upfront word estimate; 403
     *  UPGRADE_REQUIRED when it exceeds the agent-word budget. */
    translate: (projectId: string, locale: string): Promise<TranslationJob> =>
      this.request({
        method: 'POST',
        path: `/api/v1/projects/${encodeURIComponent(projectId)}/translate`,
        body: { locale },
      }),

    /** POST /api/v1/projects/:id/crawl — queue a Mode B crawl
     *  (proxy-mode projects with a siteUrl only). */
    crawl: (projectId: string): Promise<TranslationJob> =>
      this.request({
        method: 'POST',
        path: `/api/v1/projects/${encodeURIComponent(projectId)}/crawl`,
      }),

    /** GET /api/v1/projects/:id/pages — crawled site pages. */
    pages: (projectId: string): Promise<Page<SitePage>> =>
      this.requestPage({
        method: 'GET',
        path: `/api/v1/projects/${encodeURIComponent(projectId)}/pages`,
      }),

    /** GET /api/v1/projects/:id/jobs — the project's recent jobs. */
    list: (projectId: string): Promise<Page<TranslationJob>> =>
      this.requestPage({
        method: 'GET',
        path: `/api/v1/projects/${encodeURIComponent(projectId)}/jobs`,
      }),

    /** GET /api/v1/projects/jobs/:jobId — poll one job. */
    get: (jobId: string): Promise<TranslationJob> =>
      this.request({
        method: 'GET',
        path: `/api/v1/projects/jobs/${encodeURIComponent(jobId)}`,
      }),
  };

  // ─── Glossary ──────────────────────────────────────────────────────

  readonly glossary = {
    /** POST /api/v1/glossary — `translation` + `locale` = forced
     *  translation; neither = do-not-translate term. `projectId`
     *  omitted/null = account-wide. */
    create: (input: {
      term: string;
      projectId?: string | null;
      locale?: string | null;
      translation?: string | null;
      note?: string | null;
    }): Promise<GlossaryTerm> =>
      this.request({ method: 'POST', path: '/api/v1/glossary', body: input }),

    /** GET /api/v1/glossary — project terms + account-wide terms. */
    list: (params?: { projectId?: string }): Promise<Page<GlossaryTerm>> =>
      this.requestPage({
        method: 'GET',
        path: '/api/v1/glossary',
        query: { projectId: params?.projectId },
      }),

    /** DELETE /api/v1/glossary/:id */
    delete: (id: string): Promise<{ deleted: boolean }> =>
      this.request({ method: 'DELETE', path: `/api/v1/glossary/${encodeURIComponent(id)}` }),
  };

  // ─── Translation memory ────────────────────────────────────────────

  readonly tm = {
    /** GET /api/v1/tm/suggest — exact match (source hash) + fuzzy
     *  candidates for a source text. */
    suggest: (text: string, target: string): Promise<{ exact: TmEntry | null; fuzzy: TmEntry[] }> =>
      this.request({ method: 'GET', path: '/api/v1/tm/suggest', query: { text, target } }),

    /** GET /api/v1/tm/search — cross-project TM search. */
    search: (q: string, params?: { target?: string }): Promise<Page<TmEntry>> =>
      this.requestPage({
        method: 'GET',
        path: '/api/v1/tm/search',
        query: { q, target: params?.target },
      }),
  };

  // ─── API keys ──────────────────────────────────────────────────────

  readonly apiKeys = {
    /** POST /api/v1/api-keys — mint `lv_live_…`. `plaintext` is
     *  returned ONCE and never again. */
    create: (name: string): Promise<ApiKeyCreated> =>
      this.request({ method: 'POST', path: '/api/v1/api-keys', body: { name } }),

    /** GET /api/v1/api-keys */
    list: (): Promise<Page<ApiKeySummary>> =>
      this.requestPage({ method: 'GET', path: '/api/v1/api-keys' }),

    /** DELETE /api/v1/api-keys/:id — revoke (keys are never hard-deleted). */
    revoke: (id: string): Promise<{ id: string; revokedAt: string }> =>
      this.request({ method: 'DELETE', path: `/api/v1/api-keys/${encodeURIComponent(id)}` }),
  };

  // ─── Billing ───────────────────────────────────────────────────────

  readonly billing = {
    /** GET /api/v1/billing — subscription + agent-word usage + tiers. */
    get: (): Promise<BillingInfo> => this.request({ method: 'GET', path: '/api/v1/billing' }),

    /** POST /api/v1/billing/checkout — Plugipay hosted checkout for a
     *  paid tier; redirect the browser to `hostedUrl`. */
    checkout: (tier: Exclude<BillingTier, 'free'>): Promise<CheckoutResult> =>
      this.request({ method: 'POST', path: '/api/v1/billing/checkout', body: { tier } }),
  };

  // ─── Public (no auth) ──────────────────────────────────────────────

  readonly public = {
    /** POST /api/v1/public/preview — start a Mode B site preview
     *  (async; poll `previewResult`). Capped + rate-limited. */
    preview: (url: string, params?: { targetLocale?: string }): Promise<PreviewStarted> =>
      this.request({
        method: 'POST',
        path: '/api/v1/public/preview',
        body: { url, targetLocale: params?.targetLocale },
        noAuth: true,
      }),

    /** GET /api/v1/public/preview/:id — poll a preview until
     *  status is 'done' (with `pairs`) or 'failed'. */
    previewResult: (previewId: string): Promise<PreviewResult> =>
      this.request({
        method: 'GET',
        path: `/api/v1/public/preview/${encodeURIComponent(previewId)}`,
        noAuth: true,
      }),

    /** GET /api/v1/public/projects/:id/catalog — the serving endpoint
     *  locavello.js reads. Latest release only, fallback chain
     *  pre-flattened, CORS-open, cacheable. */
    catalog: (projectId: string, locale: string): Promise<PublicCatalog> =>
      this.request({
        method: 'GET',
        path: `/api/v1/public/projects/${encodeURIComponent(projectId)}/catalog`,
        query: { locale },
        noAuth: true,
      }),
  };
}
