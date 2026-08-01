/*
 * Shared helpers for queueing agent jobs (machine pass / crawl) with
 * the family toast pattern. The backend replies 200 + alreadyQueued
 * when a job for the same scope is still pending, 201 with an upfront
 * word estimate otherwise — the estimate is surfaced in the toast so
 * the cost is visible before anything runs.
 */

import { toast } from 'sonner';
import { apiRequest } from '@/lib/api';
import { errorMessage } from './format';
import type { QueuedJob } from './types';

/** POST /projects/:id/translate — returns the job, or null on failure. */
export async function queueMachinePass(
  projectId: string,
  locale: string,
): Promise<QueuedJob | null> {
  try {
    const { data } = await apiRequest<QueuedJob>(`/projects/${projectId}/translate`, {
      method: 'POST',
      body: { locale },
    });
    if (data.alreadyQueued) {
      toast.info(
        `A machine pass for "${locale}" is already ${data.status === 'running' ? 'running' : 'queued'}.`,
      );
    } else {
      const keys = data.stats?.estimatedKeys ?? 0;
      const words = data.stats?.estimatedWords ?? 0;
      toast.success(
        `Machine pass queued for "${locale}" — ${keys} keys, ~${words} words of agent usage.`,
      );
    }
    return data;
  } catch (e) {
    toast.error(errorMessage(e, `Couldn't queue machine translation for "${locale}"`));
    return null;
  }
}

/** POST /projects/:id/crawl — returns the job, or null on failure. */
export async function queueCrawl(projectId: string, siteUrl: string): Promise<QueuedJob | null> {
  try {
    const { data } = await apiRequest<QueuedJob>(`/projects/${projectId}/crawl`, {
      method: 'POST',
    });
    if (data.alreadyQueued) {
      toast.info(
        `A crawl is already ${data.status === 'running' ? 'running' : 'queued'} for this site.`,
      );
    } else {
      toast.success(`Crawl queued for ${siteUrl} — strings land in the "site" namespace.`);
    }
    return data;
  } catch (e) {
    toast.error(errorMessage(e, "Couldn't queue the crawl"));
    return null;
  }
}
