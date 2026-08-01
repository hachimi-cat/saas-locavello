import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { TranslationStatus } from './types';

export const STATUS_LABEL: Record<TranslationStatus | 'missing', string> = {
  approved: 'Approved',
  needs_review: 'Needs review',
  machine: 'Machine',
  rejected: 'Rejected',
  missing: 'Missing',
};

/** Small colored dot for dense lists (workbench key list). */
export function StatusDot({
  status,
  className,
}: {
  status: TranslationStatus | 'missing';
  className?: string;
}) {
  const color =
    status === 'approved'
      ? 'bg-primary'
      : status === 'needs_review'
        ? 'bg-primary/40'
        : status === 'machine'
          ? 'bg-muted-foreground/50'
          : status === 'rejected'
            ? 'bg-destructive'
            : 'border border-muted-foreground/40 bg-transparent';
  return (
    <span
      title={STATUS_LABEL[status]}
      aria-label={STATUS_LABEL[status]}
      className={cn('inline-block h-2 w-2 shrink-0 rounded-full', color, className)}
    />
  );
}

/** Badge for translation status (review queue, workbench header). */
export function TranslationStatusBadge({ status }: { status: TranslationStatus | 'missing' }) {
  if (status === 'approved') return <Badge>Approved</Badge>;
  if (status === 'needs_review')
    return (
      <Badge variant="outline" className="border-primary/50 text-primary">
        Needs review
      </Badge>
    );
  if (status === 'machine') return <Badge variant="secondary">Machine</Badge>;
  if (status === 'rejected') return <Badge variant="destructive">Rejected</Badge>;
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Missing
    </Badge>
  );
}
