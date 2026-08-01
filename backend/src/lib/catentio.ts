/**
 * Catentio runs client — the agent-translation provider's transport.
 *
 * Locavello dispatches `locavello-translator` runs through catentio's
 * public API (Bearer cat_pk_ key) and polls for the result. The agent
 * is instructed to return raw JSON, but agents drift — parsing here is
 * deliberately LENIENT (fences stripped, first JSON object extracted,
 * two accepted shapes) while the SAFETY checks stay mechanical and
 * strict at the write layer (placeholder gate in the translations
 * route path).
 */

const BASE = () => process.env.CATENTIO_API_URL ?? 'https://catent.io';
const KEY = () => {
  const k = process.env.CATENTIO_API_KEY;
  if (!k) throw new Error('CATENTIO_API_KEY is not set');
  return k;
};
const AGENT = () => process.env.LOCAVELLO_AGENT_SLUG ?? 'locavello-translator';

export interface TranslateItem {
  id: string;
  source: string;
  description?: string | null;
  maxLength?: number | null;
  placeholders: string[];
}

export interface TranslatePayload {
  sourceLocale: string;
  targetLocale: string;
  tone?: string;
  glossary: Array<{ term: string; translation: string | null }>;
  items: TranslateItem[];
}

export async function dispatchTranslationRun(payload: TranslatePayload): Promise<string> {
  const res = await fetch(`${BASE()}/v1/runs`, {
    method: 'POST',
    headers: { authorization: `Bearer ${KEY()}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      agent: AGENT(),
      message: { content: JSON.stringify(payload) },
    }),
  });
  if (!res.ok) {
    throw new Error(`catentio run dispatch failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { run_id?: string };
  if (!body.run_id) throw new Error('catentio run dispatch returned no run_id');
  return body.run_id;
}

export interface RunResult {
  status: string;
  output: string | null;
  error: string | null;
}

export async function getRun(runId: string): Promise<RunResult> {
  const res = await fetch(`${BASE()}/v1/runs/${runId}`, {
    headers: { authorization: `Bearer ${KEY()}` },
  });
  if (!res.ok) throw new Error(`catentio get run failed: ${res.status}`);
  const body = (await res.json()) as { status?: string; output?: unknown; error?: unknown };
  return {
    status: String(body.status ?? 'unknown'),
    output: typeof body.output === 'string' ? body.output : null,
    error: body.error == null ? null : String(body.error),
  };
}

/** Poll until the run terminates or the deadline passes. */
export async function waitForRun(
  runId: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<RunResult> {
  const deadline = Date.now() + (opts.timeoutMs ?? 300_000);
  const interval = opts.intervalMs ?? 5_000;
  for (;;) {
    const run = await getRun(runId);
    if (['succeeded', 'completed', 'failed', 'error', 'cancelled'].includes(run.status)) {
      return run;
    }
    if (Date.now() > deadline) {
      return { ...run, status: 'timeout' };
    }
    await new Promise((r) => setTimeout(r, interval));
  }
}

/**
 * Extract `{id, value}` pairs from whatever the agent actually said.
 * Accepts: raw JSON; fenced JSON; leading/trailing prose; either
 * `{translations: [{id, value}]}` (the contract) or the observed drift
 * shape `{items: [{id, target}]}`.
 */
export function parseTranslationOutput(output: string): Array<{ id: string; value: string }> {
  const candidates: string[] = [];
  const fenced = output.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) candidates.push(fenced[1]);
  candidates.push(output);
  // First balanced top-level object in the text.
  const start = output.indexOf('{');
  if (start >= 0) {
    let depth = 0;
    for (let i = start; i < output.length; i += 1) {
      if (output[i] === '{') depth += 1;
      else if (output[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          candidates.push(output.slice(start, i + 1));
          break;
        }
      }
    }
  }
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c.trim()) as Record<string, unknown>;
      const list = (parsed.translations ?? parsed.items) as unknown;
      if (!Array.isArray(list)) continue;
      const out: Array<{ id: string; value: string }> = [];
      for (const row of list) {
        if (typeof row !== 'object' || row === null) continue;
        const r = row as Record<string, unknown>;
        const id = typeof r.id === 'string' ? r.id : null;
        const value =
          typeof r.value === 'string' ? r.value : typeof r.target === 'string' ? r.target : null;
        if (id && value != null) out.push({ id, value });
      }
      if (out.length > 0) return out;
    } catch {
      // try the next candidate
    }
  }
  return [];
}
