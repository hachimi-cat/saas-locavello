import { prisma } from '../lib/db.js';
import { newId } from '../lib/ids.js';
import { checkPlaceholders, countWords } from '../lib/icu.js';
import { tmSourceHash } from '../lib/catalog.js';
import {
  dispatchTranslationRun,
  parseTranslationOutput,
  waitForRun,
  type TranslatePayload,
} from '../lib/catentio.js';

/**
 * Translation-job worker. Picks up queued TranslationJob rows and runs
 * the machine first pass through the catentio agent:
 *
 *   gather untranslated keys → batch → dispatch agent run → poll →
 *   lenient-parse → MECHANICAL placeholder gate per item → write
 *   Translation rows (status 'machine'; 'needs_review' never skipped
 *   for gated namespaces — the release builder enforces that) → meter
 *   words in AgentUsage.
 *
 * TM exact matches are applied BEFORE dispatch — a source string the
 * account has already translated to this locale never costs agent
 * words again. That reuse is the whole point of the shared TM.
 */

const POLL_MS = Number(process.env.TRANSLATION_POLL_INTERVAL_MS ?? 2_000);
const BATCH_ITEMS = 40;

let stopped = false;

export async function startTranslationWorker() {
  console.log(`[translate] worker polling every ${POLL_MS}ms`);
  while (!stopped) {
    try {
      const job = await prisma.translationJob.findFirst({
        where: { status: 'queued' },
        orderBy: { createdAt: 'asc' },
      });
      if (job) await processJob(job.id);
    } catch (e) {
      console.error('[translate] loop error', e);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

export function stopTranslationWorker() {
  stopped = true;
}

export async function processJob(jobId: string): Promise<void> {
  const job = await prisma.translationJob.update({
    where: { id: jobId },
    data: { status: 'running' },
  });
  try {
    const stats =
      job.kind === 'crawl'
        ? await runCrawl(job.projectId!)
        : await runMachinePass(job.accountId, job.projectId!, job.locale!, job.id);
    await prisma.translationJob.update({
      where: { id: job.id },
      data: { status: 'done', stats },
    });
  } catch (e) {
    console.error('[translate] job failed', job.id, e);
    await prisma.translationJob.update({
      where: { id: job.id },
      data: { status: 'failed', error: e instanceof Error ? e.message : String(e) },
    });
  }
}

const CRAWL_PAGE_CAP = Number(process.env.CRAWL_PAGE_CAP ?? 50);

/**
 * Mode B crawl: discover same-origin pages from the project's siteUrl,
 * extract visible strings per page, and upsert them as Keys in the
 * 'site' namespace (source-text-as-key — the crawler is just another
 * extractor). Never prunes: a page temporarily failing to fetch must
 * not archive its strings.
 */
export async function runCrawl(projectId: string): Promise<Record<string, number>> {
  const { safeFetchHtml } = await import('../lib/safe-fetch.js');
  const { extractStringsFromHtml, extractLinks } = await import('../lib/extract-html.js');

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project?.siteUrl) throw new Error('project has no siteUrl');

  let ns = await prisma.namespace.findUnique({
    where: { projectId_name: { projectId, name: 'site' } },
  });
  if (!ns) {
    ns = await prisma.namespace.create({
      data: { id: newId('ns'), projectId, name: 'site' },
    });
  }

  const stats = { pages: 0, errors: 0, strings: 0, newKeys: 0 };
  const queue: string[] = ['/'];
  const visited = new Set<string>();
  const base = new URL(project.siteUrl);

  while (queue.length > 0 && stats.pages < CRAWL_PAGE_CAP) {
    const path = queue.shift()!;
    if (visited.has(path)) continue;
    visited.add(path);
    const pageUrl = new URL(path, base).toString();
    const page = await prisma.sitePage.upsert({
      where: { projectId_path: { projectId, path } },
      create: { id: newId('pg'), projectId, path },
      update: {},
    });
    try {
      const { html } = await safeFetchHtml(pageUrl);
      const strings = extractStringsFromHtml(html);
      for (const link of extractLinks(html, pageUrl)) {
        if (!visited.has(link) && queue.length + visited.size < CRAWL_PAGE_CAP * 2) queue.push(link);
      }
      let newKeys = 0;
      for (const s of strings) {
        const existing = await prisma.key.findUnique({
          where: {
            projectId_namespaceId_name: { projectId, namespaceId: ns.id, name: s.text },
          },
        });
        if (existing) {
          const ctx = (existing.context ?? {}) as { pages?: string[] };
          const pages = new Set(ctx.pages ?? []);
          if (!pages.has(path)) {
            pages.add(path);
            await prisma.key.update({
              where: { id: existing.id },
              data: { context: { ...ctx, pages: [...pages] }, archived: false },
            });
          }
        } else {
          await prisma.key.create({
            data: {
              id: newId('key'),
              projectId,
              namespaceId: ns.id,
              name: s.text,
              sourceText: s.text,
              description: `on-page element: <${s.tag}>`,
              placeholders: [],
              context: { pages: [path] },
            },
          });
          newKeys += 1;
        }
      }
      stats.pages += 1;
      stats.strings += strings.length;
      stats.newKeys += newKeys;
      await prisma.sitePage.update({
        where: { id: page.id },
        data: { status: 'crawled', keyCount: strings.length, lastCrawledAt: new Date(), lastError: null },
      });
    } catch (e) {
      stats.errors += 1;
      await prisma.sitePage.update({
        where: { id: page.id },
        data: { status: 'error', lastError: e instanceof Error ? e.message : String(e) },
      });
    }
  }
  return stats;
}

export async function runMachinePass(
  accountId: string,
  projectId: string,
  locale: string,
  jobId: string | null,
): Promise<Record<string, number>> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error('project gone');

  // Keys that need work: no translation for the locale, or rejected.
  const keys = await prisma.key.findMany({
    where: {
      projectId,
      archived: false,
      OR: [
        { translations: { none: { locale } } },
        { translations: { some: { locale, status: 'rejected' } } },
      ],
    },
    include: { namespace: { select: { name: true, reviewPolicy: true } } },
  });

  const glossary = await prisma.glossaryTerm.findMany({
    where: {
      accountId,
      OR: [{ projectId }, { projectId: null }],
      AND: [{ OR: [{ locale }, { locale: null }] }],
    },
  });
  const glossaryPayload = glossary.map((g) => ({ term: g.term, translation: g.translation }));

  const stats = { requested: keys.length, fromTm: 0, translated: 0, rejectedByGate: 0, words: 0 };
  if (keys.length === 0) return stats;

  // TM exact-match pass — free, before any agent cost.
  const remaining: typeof keys = [];
  for (const key of keys) {
    const hit = await prisma.tmEntry.findFirst({
      where: { accountId, sourceHash: tmSourceHash(key.sourceText), targetLocale: locale },
      orderBy: [{ quality: 'asc' }, { updatedAt: 'desc' }], // 'approved' < 'machine'
    });
    if (hit && checkPlaceholders(key.sourceText, hit.targetText).ok) {
      await writeMachineTranslation(key.id, locale, hit.targetText, key.sourceText, 'tm');
      stats.fromTm += 1;
    } else {
      remaining.push(key);
    }
  }

  for (let i = 0; i < remaining.length; i += BATCH_ITEMS) {
    const batch = remaining.slice(i, i + BATCH_ITEMS);
    const payload: TranslatePayload = {
      sourceLocale: project.sourceLocale,
      targetLocale: locale,
      glossary: glossaryPayload,
      items: batch.map((k) => ({
        id: k.id,
        source: k.sourceText,
        description: k.description,
        maxLength: k.maxLength,
        placeholders: (k.placeholders as string[]) ?? [],
      })),
    };
    const runId = await dispatchTranslationRun(payload);
    const run = await waitForRun(runId);
    if (run.status !== 'succeeded' && run.status !== 'completed') {
      throw new Error(`agent run ${runId} ${run.status}: ${run.error ?? 'no output'}`);
    }
    const translations = parseTranslationOutput(run.output ?? '');
    const byId = new Map(translations.map((t) => [t.id, t.value]));
    let batchWords = 0;
    for (const key of batch) {
      const value = byId.get(key.id);
      if (!value) continue;
      // The mechanical gate — a placeholder-dropping machine value never
      // lands, no matter what the model said.
      if (!checkPlaceholders(key.sourceText, value).ok) {
        stats.rejectedByGate += 1;
        continue;
      }
      await writeMachineTranslation(key.id, locale, value, key.sourceText, 'agent');
      stats.translated += 1;
      batchWords += countWords(key.sourceText);
    }
    stats.words += batchWords;
    if (batchWords > 0) {
      await prisma.agentUsage.create({
        data: {
          id: newId('au'),
          accountId,
          projectId,
          jobId,
          words: batchWords,
          kind: 'included',
        },
      });
    }
  }
  return stats;
}

async function writeMachineTranslation(
  keyId: string,
  locale: string,
  value: string,
  sourceText: string,
  origin: 'tm' | 'agent',
) {
  await prisma.translation.upsert({
    where: { keyId_locale: { keyId, locale } },
    create: {
      id: newId('tr'),
      keyId,
      locale,
      value,
      status: 'machine',
      author: origin === 'tm' ? 'tm:exact' : 'agent:locavello-translator',
      wordCount: countWords(sourceText),
    },
    update: {
      value,
      status: 'machine',
      author: origin === 'tm' ? 'tm:exact' : 'agent:locavello-translator',
      rejectedReason: null,
    },
  });
}
