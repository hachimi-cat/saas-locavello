import fs from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import { CONFIG_FILENAME } from '../lib/config.js';
import { fail } from '../lib/fail.js';

/**
 * `locavello init` — interactive-free scaffold: writes locavello.json
 * (with the extract defaults spelled out so they are discoverable) and
 * an empty source catalog. The API key is NEVER written to the config —
 * it comes from LOCAVELLO_API_KEY or --api-key at call time.
 */
export const init = new Command('init')
  .description('Scaffold locavello.json + the messages directory in the current repo')
  .requiredOption('--project <id>', 'Locavello project id (prj_…)')
  .requiredOption('--api-url <url>', 'Locavello API origin, e.g. https://locavello.forjio.com')
  .option('--source <locale>', 'source locale', 'en')
  .option('--messages-dir <dir>', 'messages directory', 'messages')
  .action((opts: { project: string; apiUrl: string; source: string; messagesDir: string }) => {
    const configPath = path.join(process.cwd(), CONFIG_FILENAME);
    if (fs.existsSync(configPath)) {
      return fail(`${CONFIG_FILENAME} already exists — edit it directly, or remove it and re-run.`);
    }
    const config = {
      project: opts.project,
      apiUrl: opts.apiUrl.replace(/\/+$/, ''),
      sourceLocale: opts.source,
      messagesDir: opts.messagesDir,
      extract: {
        globs: ['src/**/*.{ts,tsx}'],
        tFunctions: ['t'],
      },
    };
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    console.log(`Wrote ${CONFIG_FILENAME}`);

    const sourceCatalog = path.join(process.cwd(), opts.messagesDir, `${opts.source}.json`);
    if (!fs.existsSync(sourceCatalog)) {
      fs.mkdirSync(path.dirname(sourceCatalog), { recursive: true });
      fs.writeFileSync(sourceCatalog, '{}\n', 'utf8');
      console.log(`Wrote ${path.relative(process.cwd(), sourceCatalog)}`);
    }
    console.log(chalk.dim('Next: set LOCAVELLO_API_KEY, then run `locavello extract --push` and `locavello pull`.'));
  });
