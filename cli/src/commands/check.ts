import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../lib/config.js';
import { apiGet, resolveApiKey } from '../lib/api.js';

interface CheckIssue {
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

interface CheckReport {
  ok: boolean;
  errors: CheckIssue[];
  warnings: CheckIssue[];
  stats: { keys: number; locales: number };
}

function describe(issue: CheckIssue): string {
  const head = `[${issue.locale}] ${issue.key}`;
  switch (issue.type) {
    case 'missing_key':
      return `${head} — missing translation`;
    case 'placeholder_mismatch':
      return `${head} — placeholder mismatch (missing: [${(issue.missing ?? []).join(', ')}], extra: [${(issue.extra ?? []).join(', ')}])`;
    case 'length_overflow':
      return `${head} — too long (estimated ${issue.estimated}, max ${issue.maxLength})`;
    case 'glossary_violation':
      return `${head} — do-not-translate term "${issue.term}" was translated away`;
    case 'unreviewed':
      return `${head} — ${issue.status} (not yet approved)`;
    default:
      return `${head} — ${issue.type}`;
  }
}

/**
 * `locavello check` — the CI gate. Exit 1 on errors; with --strict,
 * warnings fail too.
 */
export const check = new Command('check')
  .description('Run the release-readiness checks (missing keys, placeholders, lengths, glossary)')
  .option('--strict', 'also fail on warnings', false)
  .option('--json', 'machine-readable output', false)
  .option('--api-key <key>', 'API key (defaults to LOCAVELLO_API_KEY)')
  .action(async (opts: { strict: boolean; json: boolean; apiKey?: string }) => {
    const { config } = loadConfig();
    const client = { apiUrl: config.apiUrl, apiKey: resolveApiKey(opts.apiKey) };
    const data = await apiGet<CheckReport>(client, `/projects/${config.project}/check`);

    const failing = data.errors.length > 0 || (opts.strict && data.warnings.length > 0);

    if (opts.json) {
      console.log(JSON.stringify(data, null, 2));
    } else {
      for (const e of data.errors) console.log(`${chalk.red('error')}   ${e.type} ${describe(e)}`);
      for (const w of data.warnings) console.log(`${chalk.yellow('warning')} ${w.type} ${describe(w)}`);
      const summary =
        `${data.errors.length} error(s), ${data.warnings.length} warning(s) across ` +
        `${data.stats.keys} key(s) × ${data.stats.locales} locale(s).`;
      console.log(failing ? chalk.red(summary) : chalk.green(summary));
    }

    if (failing) process.exit(1);
  });
