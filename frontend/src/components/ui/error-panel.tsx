'use client';

/**
 * Reusable error panel. Ported from saas-plugipay.
 *
 * Tokenized for the family theme (destructive CSS vars) so it renders
 * correctly on the dark dashboard — the original template version used
 * hard-coded light-red hexes. Export shape is unchanged.
 */

import { TriangleAlert } from 'lucide-react';

export interface ErrorPanelProps {
  title?: string;
  message?: string;
  code?: string;
  onRetry?: () => void;
}

export function ErrorPanel({ title, message, code, onRetry }: ErrorPanelProps) {
  return (
    <div
      role="alert"
      className="flex items-start gap-4 rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-destructive"
    >
      <TriangleAlert aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold">{title ?? 'Something went wrong'}</h3>
        <p className="mt-1 text-sm leading-relaxed text-destructive/90">
          {message ?? 'The request failed. Try again in a moment.'}
        </p>
        {code && <p className="mt-2 font-mono text-[11px] opacity-75">code: {code}</p>}
        {onRetry && (
          <div className="mt-4">
            <button
              type="button"
              onClick={onRetry}
              className="rounded-md border border-destructive/40 bg-transparent px-3 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/15"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
