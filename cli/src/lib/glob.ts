import fs from 'node:fs';
import path from 'node:path';

/**
 * Dependency-free glob support for the extractor. Supports `**` (any
 * depth, including zero), `*` (within a path segment), `?` (single
 * char), and `{a,b}` alternation (nesting allowed). Enough for the
 * conventional `src/**\/*.{ts,tsx}` config without pulling in a glob
 * package or requiring Node 22's fs.glob.
 */

const REGEX_SPECIALS = new Set(['.', '+', '^', '$', '(', ')', '[', ']', '|', '\\']);

function convert(glob: string): string {
  let re = '';
  let i = 0;
  while (i < glob.length) {
    const ch = glob[i]!;
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        // `**/` → any number of directories (including none);
        // trailing/bare `**` → anything.
        if (glob[i + 2] === '/') {
          re += '(?:[^/]+/)*';
          i += 3;
        } else {
          re += '.*';
          i += 2;
        }
      } else {
        re += '[^/]*';
        i += 1;
      }
      continue;
    }
    if (ch === '?') {
      re += '[^/]';
      i += 1;
      continue;
    }
    if (ch === '{') {
      // Find the matching close brace, tracking nesting.
      let depth = 1;
      let j = i + 1;
      while (j < glob.length && depth > 0) {
        if (glob[j] === '{') depth += 1;
        else if (glob[j] === '}') depth -= 1;
        j += 1;
      }
      if (depth !== 0) {
        // Unbalanced — treat literally.
        re += '\\{';
        i += 1;
        continue;
      }
      const inner = glob.slice(i + 1, j - 1);
      // Split on top-level commas.
      const alts: string[] = [];
      let buf = '';
      let d = 0;
      for (const c of inner) {
        if (c === '{') d += 1;
        else if (c === '}') d -= 1;
        if (c === ',' && d === 0) {
          alts.push(buf);
          buf = '';
        } else {
          buf += c;
        }
      }
      alts.push(buf);
      re += `(?:${alts.map(convert).join('|')})`;
      i = j;
      continue;
    }
    re += REGEX_SPECIALS.has(ch) ? `\\${ch}` : ch;
    i += 1;
  }
  return re;
}

export function globToRegExp(glob: string): RegExp {
  return new RegExp(`^${convert(glob)}$`);
}

const IGNORED_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', 'out', '.next', '.git']);

/**
 * List files under `root` (relative, `/`-separated) matching any of the
 * globs. Skips conventional build/dependency directories and dot-dirs.
 */
export function listFiles(root: string, globs: string[]): string[] {
  const regexes = globs.map(globToRegExp);
  const out: string[] = [];
  const walk = (abs: string, rel: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        walk(path.join(abs, entry.name), relPath);
      } else if (entry.isFile()) {
        if (regexes.some((r) => r.test(relPath))) out.push(relPath);
      }
    }
  };
  walk(root, '');
  return out.sort();
}
