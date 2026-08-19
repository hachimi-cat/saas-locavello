import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Phase 5 (Chrome) of the embedded-agent pass, held as tests — the
 * locavello port of ripllo's catentio-dock-chrome.test.ts (e919d93).
 * docked-chat.tsx was copied from linksnap verbatim, and none of what
 * it got wrong type-checks:
 *
 * - `avatarUrl="/apple-touch-icon.png"` pointed at a file locavello
 *   never shipped (linksnap ships one), so every assistant reply
 *   rendered the browser's broken-image glyph. Next serves public/
 *   verbatim and nothing else checks the path. Proven live 2026-08-19:
 *   the URL 404'd on locavello.forjio.com before the fix.
 * - The dock's insets are meant to mirror <main>'s padding so the pill
 *   lines up with the page content. linksnap's shell steps at `sm:`;
 *   locavello's steps at `md:` (dashboard-shell.tsx) — the copied
 *   `sm:inset-x-6` sat 8px inside the content between 640 and 767px.
 *   Same reason `pb-52` needs the variant at the SAME breakpoint:
 *   `md:p-6` sets padding-bottom too and emits after a bare `pb-52`
 *   (the shell already carries `md:pb-52`; this holds it there).
 * - No `suggestions` → no starter chips at all. bang asked for a
 *   greeting and three ways in (2026-08-08); the package renders chips
 *   only when the product passes them.
 * - The dock's brand circle supplies the primary fill and expects a
 *   lucide-weight currentColor icon. LocavelloMark already IS one
 *   (fixed in 80a4860) — this holds it so the tile mark from
 *   app/icon.svg never migrates into the circle.
 */

const FRONTEND = resolve(__dirname, '../../../frontend');
const PUBLIC = resolve(FRONTEND, 'public');
const DOCKED = resolve(FRONTEND, 'src/components/catentio/docked-chat.tsx');
const SHELL = resolve(FRONTEND, 'src/components/dashboard-shell.tsx');
const LAYOUT = resolve(FRONTEND, 'src/app/layout.tsx');
const LOGO = resolve(FRONTEND, 'src/components/brand/logo.tsx');
const APP_ICON = resolve(FRONTEND, 'src/app/icon.svg');

const read = (p: string) => readFileSync(p, 'utf8');
/** A "/foo.png" public URL → does frontend/public/foo.png exist? */
const servedFromPublic = (url: string) => /^\/[^/]/.test(url) && existsSync(resolve(PUBLIC, `.${url}`));

describe('the docked assistant chrome (Phase 5)', () => {
  it('CONTROL — the frontend tree is where this test thinks it is', () => {
    for (const f of [DOCKED, SHELL, LAYOUT, LOGO, APP_ICON]) expect(existsSync(f), f).toBe(true);
    // and the public resolver is real: a never-shipped file is NOT found
    expect(servedFromPublic('/zzz-never-shipped.png')).toBe(false);
    expect(servedFromPublic('/js/locavello.js')).toBe(true);
  });

  it('the assistant avatar is a file public/ actually serves', () => {
    const src = read(DOCKED);
    const m = src.match(/avatarUrl="([^"]+)"/);
    expect(m, 'avatarUrl is set on <DockedChat>').not.toBeNull();
    expect(servedFromPublic(m![1]!), `${m![1]} must exist under frontend/public`).toBe(true);
  });

  it('the root layout declares the apple icon AND re-declares the tab favicon', () => {
    const src = read(LAYOUT);
    const block = src.match(/icons:\s*\{[\s\S]*?\n\s*\},/);
    expect(block, 'metadata.icons is declared').not.toBeNull();
    const apple = block![0].match(/apple:\s*'([^']+)'/);
    expect(apple, "icons.apple: '/apple-touch-icon.png' declared").not.toBeNull();
    expect(servedFromPublic(apple![1]!), `${apple![1]} must exist under frontend/public`).toBe(true);
    // In Next 15.5 an explicit metadata.icons REPLACES the app/icon.svg
    // file-convention link instead of merging (serront proved it with
    // two builds, 2026-08-19), so the block must RE-declare the link to
    // the /icon.svg route the file convention still builds — dropping
    // the icon: entry silently un-favicons every page.
    expect(existsSync(APP_ICON), 'src/app/icon.svg (builds the /icon.svg route)').toBe(true);
    expect(block![0], "icons.icon re-declares the '/icon.svg' route").toMatch(/url:\s*'\/icon\.svg'/);
  });

  it("the dock's insets step at the same breakpoint as <main>'s padding, and the reserve carries that variant", () => {
    const shell = read(SHELL);
    const main = shell.match(/<main\s+className=\{`([^`]*)`/);
    expect(main, '<main className={`…`}> found').not.toBeNull();
    const padStep = main![1]!.match(/\b(sm|md|lg):p-6\b/);
    expect(padStep, 'main pads p-4 then <bp>:p-6').not.toBeNull();
    const bp = padStep![1]!;
    // the reserve must be re-asserted at that same breakpoint
    expect(main![1], `pb-52 must be re-asserted as ${bp}:pb-52 (\`${bp}:p-6\` overrides a bare pb-52)`).toMatch(new RegExp(`\\bpb-52 ${bp}:pb-52\\b`));

    const dock = read(DOCKED);
    // resting: 'absolute inset-x-4 bottom-4 … <bp>:inset-x-6 <bp>:bottom-6'
    const resting = dock.match(/'absolute inset-x-4 bottom-4 [^']*'/);
    expect(resting, 'resting dock class string found').not.toBeNull();
    expect(resting![0]).toContain(`${bp}:inset-x-6`);
    expect(resting![0]).toContain(`${bp}:bottom-6`);
    // expanded: 'fixed inset-0 … <bp>:absolute <bp>:inset-x-6 <bp>:bottom-6 <bp>:top-6'
    const expanded = dock.match(/'fixed inset-0 [^']*'/);
    expect(expanded, 'expanded dock class string found').not.toBeNull();
    for (const t of ['absolute', 'inset-x-6', 'bottom-6', 'top-6']) expect(expanded![0]).toContain(`${bp}:${t}`);
    // and no OTHER breakpoint prefix sneaks into either string
    const others = ['sm', 'md', 'lg'].filter((x) => x !== bp);
    for (const o of others) {
      expect(resting![0]).not.toMatch(new RegExp(`\\b${o}:`));
      expect(expanded![0]).not.toMatch(new RegExp(`\\b${o}:`));
    }
  });

  it('the brand circle gets the bare glyph — currentColor strokes, no tile — and the tile stays in app/icon.svg', () => {
    const dock = read(DOCKED);
    expect(dock).toMatch(/brandIcon=\{<LocavelloMark\s*\/>\}/);
    const logo = read(LOGO);
    // (to the NEXT export — the mark destructures its props over
    // multiple lines, so a bare `\n}` would clip at the parameter list)
    const glyph = logo.match(/export function LocavelloMark[\s\S]*?(?=export function|$)/);
    expect(glyph, 'LocavelloMark exported from brand/logo.tsx').not.toBeNull();
    expect(glyph![0]).toContain('currentColor');
    expect(glyph![0]).not.toContain('<rect');
    expect(glyph![0]).toContain('viewBox="0 0 24 24"');
    // the tile is still the tile (app-icon favicon uses it)
    expect(read(APP_ICON)).toContain('<rect');
  });

  it('a new session offers three starter chips', () => {
    const dock = read(DOCKED);
    const m = dock.match(/suggestions=\{\[([\s\S]*?)\]\}/);
    expect(m, 'suggestions={[…]} passed to <DockedChat>').not.toBeNull();
    const chips = [...m![1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]!.trim()).filter(Boolean);
    expect(chips).toHaveLength(3);
    for (const c of chips) expect(c.length).toBeGreaterThan(12);
  });
});
