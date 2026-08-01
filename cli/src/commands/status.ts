import { Command } from 'commander';
import { loadConfig } from '../lib/config.js';
import { apiGet, resolveApiKey } from '../lib/api.js';

interface LocaleStat {
  tag: string;
  fallback: string | null;
  enabled: boolean;
  keyCount: number;
  approved: number;
  machine: number;
  needsReview: number;
  missing: number;
}

interface ProjectDetail {
  id: string;
  name: string;
  slug: string;
  sourceLocale: string;
  locales: LocaleStat[];
}

function renderTable(rows: string[][]): string {
  const widths = rows[0]!.map((_, col) => Math.max(...rows.map((r) => (r[col] ?? '').length)));
  return rows
    .map((r) => r.map((cell, col) => cell.padEnd(widths[col]!)).join('  ').trimEnd())
    .join('\n');
}

/** `locavello status` — per-locale completion, straight off /projects/:id. */
export const status = new Command('status')
  .description('Show per-locale translation completion for the project')
  .option('--json', 'machine-readable output', false)
  .option('--api-key <key>', 'API key (defaults to LOCAVELLO_API_KEY)')
  .action(async (opts: { json: boolean; apiKey?: string }) => {
    const { config } = loadConfig();
    const client = { apiUrl: config.apiUrl, apiKey: resolveApiKey(opts.apiKey) };
    const data = await apiGet<ProjectDetail>(client, `/projects/${config.project}`);

    if (opts.json) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    console.log(`${data.name} (${data.id}) — source ${data.sourceLocale}`);
    if (data.locales.length === 0) {
      console.log('No target locales yet — add one in the dashboard.');
      return;
    }
    const rows: string[][] = [
      ['LOCALE', 'KEYS', 'APPROVED', 'MACHINE', 'NEEDS_REVIEW', 'MISSING', 'COMPLETE'],
    ];
    for (const l of data.locales) {
      const done = l.keyCount > 0 ? Math.round(((l.keyCount - l.missing) / l.keyCount) * 100) : 0;
      rows.push([
        l.tag + (l.enabled ? '' : ' (disabled)'),
        String(l.keyCount),
        String(l.approved),
        String(l.machine),
        String(l.needsReview),
        String(l.missing),
        `${done}%`,
      ]);
    }
    console.log(renderTable(rows));
  });
