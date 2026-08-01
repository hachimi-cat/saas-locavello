import { Command } from 'commander';
import { auth } from './commands/auth.js';
import { init } from './commands/init.js';
import { extract } from './commands/extract.js';
import { pull } from './commands/pull.js';
import { status } from './commands/status.js';
import { check } from './commands/check.js';
import { pseudo } from './commands/pseudo.js';

const brand = process.env.LOCAVELLO ?? 'locavello';

const program = new Command()
  .name(brand)
  .description(`CLI for ${brand} — extract, push, pull, and gate your app's translations.`)
  .version('0.1.0');

program.addCommand(auth);
program.addCommand(init);
program.addCommand(extract);
program.addCommand(pull);
program.addCommand(status);
program.addCommand(check);
program.addCommand(pseudo);

program.parseAsync(process.argv).catch((e) => {
  console.error(e);
  process.exit(1);
});
