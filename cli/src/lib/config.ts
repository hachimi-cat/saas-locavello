import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { fail } from './fail.js';

/**
 * `locavello.json` — the per-repo config file, committed by the customer
 * project. The API key is deliberately NOT part of it: it comes from the
 * `LOCAVELLO_API_KEY` env var or the `--api-key` flag so it never lands
 * in a repo.
 */

export const CONFIG_FILENAME = 'locavello.json';

const configSchema = z.object({
  project: z.string().min(1),
  apiUrl: z.string().url(),
  sourceLocale: z.string().min(2).default('en'),
  messagesDir: z.string().min(1).default('messages'),
  extract: z
    .object({
      globs: z.array(z.string()).min(1).default(['src/**/*.{ts,tsx}']),
      tFunctions: z.array(z.string()).min(1).default(['t']),
    })
    .default({}),
});

export type LocavelloConfig = z.infer<typeof configSchema>;

export interface LoadedConfig {
  config: LocavelloConfig;
  /** Directory containing locavello.json — all paths resolve from here. */
  root: string;
}

/** Walk up from `startDir` looking for locavello.json. */
export function findConfig(startDir: string = process.cwd()): string | null {
  let dir = path.resolve(startDir);
  for (;;) {
    const file = path.join(dir, CONFIG_FILENAME);
    if (fs.existsSync(file)) return file;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function loadConfig(startDir: string = process.cwd()): LoadedConfig {
  const file = findConfig(startDir);
  if (!file) {
    return fail(`${CONFIG_FILENAME} not found (searched ${startDir} and parents) — run \`locavello init\` first.`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fail(`${file} is not valid JSON: ${(e as Error).message}`);
  }
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(`${file} is invalid: ${issue ? `${issue.path.join('.')} — ${issue.message}` : parsed.error.message}`);
  }
  return { config: parsed.data, root: path.dirname(file) };
}

export function messagesPath(loaded: LoadedConfig, fileName: string): string {
  return path.join(loaded.root, loaded.config.messagesDir, fileName);
}
