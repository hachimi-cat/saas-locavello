import { describe, expect, it } from 'vitest';
import { extractLinks, extractStringsFromHtml } from '../lib/extract-html.js';
import { assertPublicHttpUrl, UnsafeUrlError } from '../lib/safe-fetch.js';

const PAGE = `<!doctype html><html><head>
<title>Acme — ship faster</title>
<meta name="description" content="Acme helps teams ship faster.">
<style>.x{color:red}</style>
<script>var hidden = "not visible";</script>
</head><body>
<h1>Ship your product faster</h1>
<p>Acme is the <strong>easiest</strong> way to deploy.</p>
<button>Get started</button>
<input placeholder="Work email">
<img src="/x.png" alt="Team photo">
<code>npm install acme</code>
<a href="/pricing">Pricing</a>
<a href="/pricing#faq">Pricing FAQ anchor</a>
<a href="https://other.com/page">External</a>
<a href="/logo.png">Logo file</a>
<p>42</p>
<p>https://acme.com</p>
</body></html>`;

describe('extractStringsFromHtml', () => {
  const strings = extractStringsFromHtml(PAGE);
  const texts = strings.map((s) => s.text);

  it('finds visible text, buttons, placeholders, alts, title and meta', () => {
    expect(texts).toContain('Ship your product faster');
    expect(texts).toContain('Get started');
    expect(texts).toContain('Work email');
    expect(texts).toContain('Team photo');
    expect(texts).toContain('Acme — ship faster');
    expect(texts).toContain('Acme helps teams ship faster.');
  });

  it('skips script/style/code, numbers-only and bare URLs', () => {
    expect(texts).not.toContain('not visible');
    expect(texts).not.toContain('npm install acme');
    expect(texts).not.toContain('42');
    expect(texts).not.toContain('https://acme.com');
  });

  it('dedupes and tags elements', () => {
    const h1 = strings.find((s) => s.text === 'Ship your product faster');
    expect(h1?.tag).toBe('h1');
    expect(new Set(texts).size).toBe(texts.length);
  });
});

describe('extractLinks', () => {
  it('keeps same-origin paths, strips hash/query, drops assets + externals', () => {
    const links = extractLinks(PAGE, 'https://acme.com/');
    expect(links).toContain('/pricing');
    expect(links).not.toContain('/logo.png');
    expect(links.some((l) => l.includes('other.com'))).toBe(false);
    // hash variant collapses into the same path
    expect(links.filter((l) => l === '/pricing')).toHaveLength(1);
  });
});

describe('assertPublicHttpUrl — the SSRF gate', () => {
  it('rejects non-http schemes', async () => {
    await expect(assertPublicHttpUrl('file:///etc/passwd')).rejects.toThrow(UnsafeUrlError);
    await expect(assertPublicHttpUrl('gopher://x')).rejects.toThrow(UnsafeUrlError);
  });

  it('rejects private, loopback, link-local and CGN literals', async () => {
    for (const bad of [
      'http://127.0.0.1/x',
      'http://10.0.0.8/',
      'http://192.168.1.1/',
      'http://172.16.5.5/',
      'http://169.254.169.254/latest/meta-data',
      'http://100.104.78.111/',
      'http://[::1]/',
    ]) {
      await expect(assertPublicHttpUrl(bad)).rejects.toThrow(UnsafeUrlError);
    }
  });

  it('accepts a public literal', async () => {
    const url = await assertPublicHttpUrl('https://1.1.1.1/');
    expect(url.hostname).toBe('1.1.1.1');
  });

  it('rejects hostnames resolving to private space', async () => {
    await expect(assertPublicHttpUrl('http://localhost/')).rejects.toThrow(UnsafeUrlError);
  });
});
