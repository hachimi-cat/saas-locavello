import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { h } from '../lib/async-handler.js';
import { ApiError, pathParam, sendOk } from '../lib/http.js';
import { safeFetchHtml, UnsafeUrlError } from '../lib/safe-fetch.js';
import { extractStringsFromHtml } from '../lib/extract-html.js';
import { dispatchTranslationRun, parseTranslationOutput, waitForRun } from '../lib/catentio.js';
import { newId } from '../lib/ids.js';

/**
 * PUBLIC Mode B surface — deliberately unauthenticated:
 *
 *  - POST /preview  — the marketing hero. URL in → ~30s → the page's
 *    strings translated side-by-side. This is the conversion mechanic;
 *    it costs real agent words, so it is tightly capped (string count,
 *    word count, per-IP rate limit mounted in routes/index.ts).
 *  - GET /projects/:id/catalog — the serving endpoint locavello.js
 *    reads. Latest RELEASE only (never drafts), CORS-open, cacheable.
 *    If this endpoint is down the snippet fails OPEN to the source
 *    language — never a blank page.
 */

const router = Router();

const previewSchema = z.object({
  url: z.string().min(4).max(2000),
  targetLocale: z
    .string()
    .regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/, 'must be a BCP-47 tag')
    .default('id'),
});

const PREVIEW_MAX_STRINGS = 40;
const PREVIEW_MAX_WORDS = 500;
/** Global daily wallet guard for the anonymous hero — ~100 previews. */
const PREVIEW_DAILY_WORD_CAP = Number(process.env.PREVIEW_DAILY_WORD_CAP ?? 50_000);
const PREVIEW_ACCOUNT = 'public:preview';

router.post(
  '/preview',
  h(async (req, res) => {
    const body = previewSchema.parse(req.body ?? {});

    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const spent = await prisma.agentUsage.aggregate({
      where: { accountId: PREVIEW_ACCOUNT, createdAt: { gte: dayStart } },
      _sum: { words: true },
    });
    if ((spent._sum.words ?? 0) >= PREVIEW_DAILY_WORD_CAP) {
      throw new ApiError(
        503,
        'PREVIEW_BUDGET_EXHAUSTED',
        'the free preview is very popular today — sign up to translate your site, or try again tomorrow',
      );
    }
    let page;
    try {
      page = await safeFetchHtml(body.url.startsWith('http') ? body.url : `https://${body.url}`);
    } catch (e) {
      if (e instanceof UnsafeUrlError) {
        throw new ApiError(422, 'INVALID_URL', e.message, 'url');
      }
      throw new ApiError(422, 'FETCH_FAILED', `could not fetch that page: ${(e as Error).message}`, 'url');
    }

    const all = extractStringsFromHtml(page.html, 200);
    const items: Array<{ id: string; source: string; description: string; placeholders: string[] }> = [];
    let words = 0;
    for (const s of all) {
      const w = s.text.split(/\s+/).length;
      if (items.length >= PREVIEW_MAX_STRINGS || words + w > PREVIEW_MAX_WORDS) break;
      words += w;
      items.push({
        id: `s${items.length}`,
        source: s.text,
        description: `on-page element: <${s.tag}>`,
        placeholders: [],
      });
    }
    if (items.length === 0) {
      throw new ApiError(422, 'NO_TEXT', 'no translatable text found on that page', 'url');
    }

    const runId = await dispatchTranslationRun({
      sourceLocale: 'auto',
      targetLocale: body.targetLocale,
      glossary: [],
      items,
    });
    const run = await waitForRun(runId, { timeoutMs: 60_000, intervalMs: 3_000 });
    if (run.status !== 'succeeded' && run.status !== 'completed') {
      throw new ApiError(503, 'PREVIEW_UNAVAILABLE', 'translation did not complete in time — try again');
    }
    const translated = parseTranslationOutput(run.output ?? '');
    const byId = new Map(translated.map((t) => [t.id, t.value]));
    const pairs = items
      .map((i) => ({ original: i.source, translated: byId.get(i.id) ?? null }))
      .filter((p) => p.translated !== null);

    await prisma.agentUsage.create({
      data: { id: newId('au'), accountId: PREVIEW_ACCOUNT, words, kind: 'included' },
    });

    return sendOk(res, req, {
      url: page.finalUrl,
      targetLocale: body.targetLocale,
      pairs,
      stringsOnPage: all.length,
      previewedWords: words,
    });
  }),
);

/**
 * GET /projects/:id/catalog?locale=xx — what locavello.js consumes.
 * Serves the latest published release for the locale (plus its
 * fallback chain, pre-flattened so the client does zero logic).
 */
router.get(
  '/projects/:id/catalog',
  h(async (req, res) => {
    const projectId = pathParam(req, 'id');
    const locale = typeof req.query.locale === 'string' ? req.query.locale : '';
    if (!locale) throw new ApiError(422, 'VALIDATION_ERROR', 'locale is required', 'locale');

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new ApiError(404, 'NOT_FOUND', 'project not found');

    // Flatten the fallback chain: walk locale → fallback → … → source.
    const locales = await prisma.projectLocale.findMany({ where: { projectId } });
    const byTag = new Map(locales.map((l) => [l.tag, l]));
    const chain: string[] = [];
    let cursor: string | null = locale;
    while (cursor && !chain.includes(cursor)) {
      chain.push(cursor);
      cursor = byTag.get(cursor)?.fallback ?? null;
    }

    const catalog: Record<string, string> = {};
    let releaseId: string | null = null;
    // Apply farthest-fallback first so the requested locale wins.
    for (const tag of [...chain].reverse()) {
      const release = await prisma.release.findFirst({
        where: { projectId, locale: tag },
        orderBy: { createdAt: 'desc' },
      });
      if (release) {
        Object.assign(catalog, release.catalog as Record<string, string>);
        if (tag === locale) releaseId = release.id;
      }
    }

    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('cache-control', 'public, max-age=60, s-maxage=300');
    return sendOk(res, req, {
      projectId,
      locale,
      releaseId,
      enabledLocales: locales.filter((l) => l.enabled).map((l) => l.tag),
      sourceLocale: project.sourceLocale,
      catalog,
    });
  }),
);

/** CORS preflight for the catalog (script may fetch cross-origin). */
router.options('/projects/:id/catalog', (_req, res) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET, OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
  res.status(204).end();
});

export default router;
