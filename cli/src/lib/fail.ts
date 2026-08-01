import chalk from 'chalk';

/** Print an error message and exit 1 — the CLI's single failure path. */
export function fail(message: string): never {
  console.error(chalk.red(message));
  process.exit(1);
}
