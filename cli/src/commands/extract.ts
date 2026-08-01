import fs from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig, messagesPath } from '../lib/config.js';
import { listFiles } from '../lib/glob.js';
import { mergeScans, scanSource, type ExtractedKey } from '../lib/extractor.js';
import { catalogKeyName, readCatalog, writeCatalog } from '../lib/files.js';
import { apiPut, resolveApiKey } from '../lib/api.js';
import { fail } from '../lib/fail.js';

/** The server caps a single upsert request at 2000 keys. */
const REQUEST_KEY_CAP = 2000;
const BATCH_SIZE = 500;

interface UpsertResult {
  created: number;
  updated: number;
  archived: number;
}

/**
 * `locavello extract` — scan the configured globs for t() calls, merge
 * the found keys into `<messagesDir>/<sourceLocale>.json`, and with
 * --push upsert them to the engine.
 *
 * Namespace rule: ONLY an explicit `ns:key` colon form selects a
 * namespace (t('marketing:hero.title') → namespace 'marketing', key
 * 'hero.title'). Dots never split — t('marketing.hero.title') is a key
 * in the 'default' namespace, and plain source text (t('Create link'))
 * is a default-namespace key whose value === the key.
 */
export const extract = new Command('extract')
  .description('Scan source files for t() keys and merge them into the source catalog')
  .option('--push', 'PUT the extracted keys to the Locavello engine', false)
  .option('--prune', 'archive server keys absent from this extraction (per namespace)', false)
  .option('--api-key <key>', 'API key (defaults to LOCAVELLO_API_KEY)')
  .addHelpText(
    'after',
    [
      '',
      'Namespaces come ONLY from an explicit `ns:key` colon form:',
      "  t('marketing:hero.title')   → namespace 'marketing', key 'hero.title'",
      "  t('marketing.hero.title')   → 'default' namespace, key 'marketing.hero.title' (dots never split)",
      "  t('Create link')            → 'default' namespace, source text as the key",
      'Template literals with ${…} are unextractable and reported as warnings.',
    ].join('\n'),
  )
  .action(async (opts: { push: boolean; prune: boolean; apiKey?: string }) => {
    const loaded = loadConfig();
    const { config, root } = loaded;

    const files = listFiles(root, config.extract.globs);
    const scans = files.map((file) => ({
      file,
      result: scanSource(fs.readFileSync(path.join(root, file), 'utf8'), file, config.extract.tFunctions),
    }));
    const { keys, warnings } = mergeScans(scans);

    for (const w of warnings) {
      console.warn(chalk.yellow(`warning ${w.file}:${w.line} — ${w.message}`));
    }

    // ── Merge into the source catalog ─────────────────────────────────
    const sourceFile = messagesPath(loaded, `${config.sourceLocale}.json`);
    const existing = readCatalog(sourceFile) ?? {};
    const merged: Record<string, string> = opts.prune ? {} : { ...existing };
    const needsSourceText: string[] = [];
    let added = 0;
    for (const key of keys) {
      const catalogName = catalogKeyName(key.namespace, key.name);
      if (existing[catalogName] !== undefined) {
        merged[catalogName] = existing[catalogName];
        continue;
      }
      added += 1;
      if (key.namespace === 'default') {
        merged[catalogName] = key.name; // source-text-as-key: value === key
      } else {
        merged[catalogName] = ''; // source text is maintained in the catalog file
        needsSourceText.push(catalogName);
      }
    }
    writeCatalog(sourceFile, merged);

    console.log(
      `Extracted ${keys.length} key(s) from ${files.length} file(s) — ${added} new, ` +
        `${warnings.length} warning(s). Wrote ${path.relative(process.cwd(), sourceFile) || sourceFile}.`,
    );
    if (needsSourceText.length > 0) {
      console.warn(
        chalk.yellow(
          `${needsSourceText.length} namespaced key(s) have no source text yet — fill in their values in ` +
            `${path.basename(sourceFile)}: ${needsSourceText.slice(0, 10).join(', ')}${needsSourceText.length > 10 ? ', …' : ''}`,
        ),
      );
    }

    if (!opts.push) {
      if (opts.prune) console.log(chalk.dim('--prune has no server effect without --push (local catalog was pruned).'));
      return;
    }

    // ── Push ──────────────────────────────────────────────────────────
    const client = { apiUrl: config.apiUrl, apiKey: resolveApiKey(opts.apiKey) };
    const payload = keys
      .filter((key) => {
        if (key.name.length > 2000) {
          console.warn(chalk.yellow(`warning — key longer than 2000 chars skipped: "${key.name.slice(0, 60)}…"`));
          return false;
        }
        return true;
      })
      .map((key: ExtractedKey) => ({
        namespace: key.namespace,
        name: key.name,
        sourceText: merged[catalogKeyName(key.namespace, key.name)] ?? key.name,
        context: { usages: key.usages },
      }));

    if (payload.length === 0) return fail('Nothing to push — no keys extracted.');

    const totals: UpsertResult = { created: 0, updated: 0, archived: 0 };
    const keysPath = `/projects/${config.project}/keys`;

    if (opts.prune && payload.length <= REQUEST_KEY_CAP) {
      // One request with the complete picture + prune — the server
      // archives per-namespace keys absent from the payload, so prune
      // is only correct on a request containing ALL keys.
      const res = await apiPut<UpsertResult>(client, keysPath, { keys: payload, prune: true });
      totals.created += res.created;
      totals.updated += res.updated;
      totals.archived += res.archived;
    } else {
      if (opts.prune) {
        console.warn(
          chalk.yellow(
            `--prune skipped: ${payload.length} keys exceed the ${REQUEST_KEY_CAP}-key request cap, ` +
              'and prune is only safe on a single request containing every key.',
          ),
        );
      }
      for (let i = 0; i < payload.length; i += BATCH_SIZE) {
        const batch = payload.slice(i, i + BATCH_SIZE);
        const res = await apiPut<UpsertResult>(client, keysPath, { keys: batch, prune: false });
        totals.created += res.created;
        totals.updated += res.updated;
        totals.archived += res.archived;
      }
    }

    console.log(
      `Pushed ${payload.length} key(s) → created ${totals.created}, updated ${totals.updated}, archived ${totals.archived}.`,
    );
  });
