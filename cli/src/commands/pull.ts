import fs from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, messagesPath } from '../lib/config.js';
import { apiGet, resolveApiKey } from '../lib/api.js';
import { renderDts, writeCatalog, writeJson } from '../lib/files.js';

interface PullResponse {
  projectId: string;
  sourceLocale: string;
  source: Record<string, string>;
  locales: Record<
    string,
    { catalog: Record<string, string>; releaseId: string | null; contentHash: string }
  >;
  fallbacks: Record<string, string | null>;
}

/**
 * `locavello pull` — the CI/dev sync. Writes one catalog file per
 * locale, the source catalog, `_meta.json` (release ids + hashes +
 * fallbacks), and `locavello.d.ts` so `t()` keys type-check.
 */
export const pull = new Command('pull')
  .description('Download released catalogs + regenerate locavello.d.ts')
  .option('--draft', 'include unreleased draft catalogs for locales without a release', false)
  .option('--pseudo', 'also fetch the synthesized en-XA pseudo-locale', false)
  .option('--api-key <key>', 'API key (defaults to LOCAVELLO_API_KEY)')
  .action(async (opts: { draft: boolean; pseudo: boolean; apiKey?: string }) => {
    const loaded = loadConfig();
    const { config, root } = loaded;
    const client = { apiUrl: config.apiUrl, apiKey: resolveApiKey(opts.apiKey) };

    const params = new URLSearchParams();
    if (opts.draft) params.set('draft', 'true');
    if (opts.pseudo) params.set('pseudo', 'true');
    const qs = params.size > 0 ? `?${params.toString()}` : '';
    const data = await apiGet<PullResponse>(client, `/projects/${config.project}/pull${qs}`);

    // Target-locale catalogs.
    const releaseIds: Record<string, string | null> = {};
    const contentHashes: Record<string, string> = {};
    for (const [tag, entry] of Object.entries(data.locales)) {
      writeCatalog(messagesPath(loaded, `${tag}.json`), entry.catalog);
      releaseIds[tag] = entry.releaseId;
      contentHashes[tag] = entry.contentHash;
      console.log(
        `${tag}: ${Object.keys(entry.catalog).length} key(s)` +
          (entry.releaseId ? ` (release ${entry.releaseId})` : chalk.dim(' (draft)')),
      );
    }

    // Source catalog — the repo-owned truth for the source locale.
    const sourceFile = messagesPath(loaded, `${data.sourceLocale}.json`);
    writeCatalog(sourceFile, data.source);
    console.log(`${data.sourceLocale}: ${Object.keys(data.source).length} key(s) (source)`);

    // Typed keys — locavello.d.ts next to locavello.json.
    const dtsFile = path.join(root, 'locavello.d.ts');
    fs.writeFileSync(dtsFile, renderDts(Object.keys(data.source)), 'utf8');
    console.log(`Wrote ${path.relative(process.cwd(), dtsFile) || dtsFile}`);

    // Pull metadata.
    writeJson(messagesPath(loaded, '_meta.json'), {
      releaseIds,
      contentHashes,
      fallbacks: data.fallbacks,
      pulledAt: new Date().toISOString(),
    });
    console.log(`Wrote ${path.relative(process.cwd(), messagesPath(loaded, '_meta.json'))}`);
  });
