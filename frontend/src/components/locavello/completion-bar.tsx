import { cn } from '@/lib/utils';

/**
 * Per-locale completion bar. Approved fills with the brand primary,
 * needs_review / machine render as muted "in progress" segments, and
 * whatever is missing stays as the empty track.
 */
export function CompletionBar({
  approved,
  needsReview,
  machine,
  keyCount,
  className,
}: {
  approved: number;
  needsReview: number;
  machine: number;
  keyCount: number;
  className?: string;
}) {
  const pct = (n: number) => (keyCount > 0 ? Math.min(100, (n / keyCount) * 100) : 0);
  return (
    <div
      className={cn('flex h-2 w-full overflow-hidden rounded-full bg-muted', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={keyCount}
      aria-valuenow={approved}
      aria-label={`${approved} of ${keyCount} approved`}
    >
      <div className="h-full bg-primary" style={{ width: `${pct(approved)}%` }} />
      <div className="h-full bg-primary/40" style={{ width: `${pct(needsReview)}%` }} />
      <div className="h-full bg-muted-foreground/40" style={{ width: `${pct(machine)}%` }} />
    </div>
  );
}

/** "12/40 approved" caption used next to the bar. */
export function completionCaption(approved: number, keyCount: number): string {
  if (keyCount === 0) return 'no keys yet';
  return `${approved}/${keyCount} approved`;
}
