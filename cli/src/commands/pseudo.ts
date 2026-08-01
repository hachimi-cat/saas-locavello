import path from 'node:path';
import { Command } from 'commander';
import { loadConfig, messagesPath } from '../lib/config.js';
import { pseudoizeCatalog } from '../lib/pseudo.js';
import { readCatalog, writeCatalog } from '../lib/files.js';
import { fail } from '../lib/fail.js';

/**
 * `locavello pseudo` — LOCAL, no network. Reads the source catalog and
 * writes `en-XA.json` using the same pseudoize algorithm as the server
 * (accented + padded + bracketed, ICU placeholders intact). Run the app
 * under en-XA to spot hardcoded strings and tight layouts before paying
 * for a single translation.
 */
export const pseudo = new Command('pseudo')
  .description('Generate the en-XA pseudo-locale catalog locally from the source catalog')
  .action(() => {
    const loaded = loadConfig();
    const sourceFile = messagesPath(loaded, `${loaded.config.sourceLocale}.json`);
    const source = readCatalog(sourceFile);
    if (source === null) {
      return fail(`${sourceFile} not found — run \`locavello extract\` or \`locavello pull\` first.`);
    }
    const outFile = messagesPath(loaded, 'en-XA.json');
    writeCatalog(outFile, pseudoizeCatalog(source));
    console.log(
      `Wrote ${path.relative(process.cwd(), outFile) || outFile} (${Object.keys(source).length} key(s)).`,
    );
  });
