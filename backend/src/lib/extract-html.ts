import { parse } from 'node-html-parser';

/**
 * Visible-string extraction from an HTML document — the Mode B
 * "extractor". The crawler is just another extractor: what it finds
 * lands in the same Key/Translation schema as an SDK push.
 */

const SKIP_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'code',
  'pre',
  'svg',
  'template',
  'iframe',
]);

/** Attributes whose values are user-visible copy. */
const TEXT_ATTRS = ['placeholder', 'title', 'alt', 'aria-label'] as const;

export interface ExtractedString {
  text: string;
  /** rough location hint, e.g. "h1", "button", "p" */
  tag: string;
}

function normalize(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

function looksTranslatable(text: string): boolean {
  if (text.length < 2 || text.length > 500) return false;
  if (!/\p{L}/u.test(text)) return false; // needs at least one letter
  if (/^[\d\s\p{P}\p{S}]+$/u.test(text)) return false;
  // Skip bare URLs/emails/code-ish tokens.
  if (/^(https?:\/\/|www\.|[\w.+-]+@[\w-]+\.)/i.test(text)) return false;
  // Markup that leaked through as a text node (doctype, stray tags).
  if (text.includes('<') || text.includes('>')) return false;
  return true;
}

export function extractStringsFromHtml(html: string, maxStrings = 400): ExtractedString[] {
  const root = parse(html, { blockTextElements: { script: false, style: false, pre: true } });
  const seen = new Set<string>();
  const out: ExtractedString[] = [];

  const push = (text: string, tag: string) => {
    const norm = normalize(text);
    if (!looksTranslatable(norm) || seen.has(norm)) return;
    seen.add(norm);
    out.push({ text: norm, tag });
  };

  const walk = (node: ReturnType<typeof parse>): void => {
    for (const child of node.childNodes) {
      const el = child as unknown as {
        nodeType: number;
        rawTagName?: string;
        text?: string;
        childNodes: unknown[];
        getAttribute?: (n: string) => string | undefined;
      };
      if (out.length >= maxStrings) return;
      if (el.nodeType === 3) {
        // text node — attribute the parent's tag
        const parentTag = (node as unknown as { rawTagName?: string }).rawTagName ?? 'body';
        if (el.text) push(el.text, parentTag.toLowerCase());
        continue;
      }
      const tag = (el.rawTagName ?? '').toLowerCase();
      if (SKIP_TAGS.has(tag)) continue;
      if (el.getAttribute) {
        for (const attr of TEXT_ATTRS) {
          const v = el.getAttribute(attr);
          if (v) push(v, `${tag}[${attr}]`);
        }
      }
      walk(child as unknown as ReturnType<typeof parse>);
    }
  };
  walk(root);

  // Meta description + title carry SEO weight — include them.
  const title = root.querySelector('title')?.text;
  if (title) push(title, 'title');
  const desc = root.querySelector('meta[name="description"]')?.getAttribute('content');
  if (desc) push(desc, 'meta[description]');

  return out;
}

/** Same-origin link discovery for the crawler (path list, deduped). */
export function extractLinks(html: string, baseUrl: string, cap = 200): string[] {
  const root = parse(html);
  const base = new URL(baseUrl);
  const seen = new Set<string>();
  for (const a of root.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href');
    if (!href) continue;
    let url: URL;
    try {
      url = new URL(href, base);
    } catch {
      continue;
    }
    if (url.origin !== base.origin) continue;
    if (/\.(png|jpe?g|gif|svg|webp|pdf|zip|mp4|css|js|ico|xml)$/i.test(url.pathname)) continue;
    url.hash = '';
    url.search = '';
    const path = url.pathname || '/';
    if (!seen.has(path)) seen.add(path);
    if (seen.size >= cap) break;
  }
  return [...seen];
}
