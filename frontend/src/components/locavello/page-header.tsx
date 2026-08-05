import type { ReactNode } from 'react';

/** Shared page header — title on the left, actions on the right. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    // Phone: title, subtitle and each action stack — one per row, actions
    // full-width. sm+ restores the classic title-left/action-right line.
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start">
      <div className="min-w-0 sm:flex-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <div className="mt-1 text-sm text-muted-foreground">{description}</div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-col items-stretch gap-2 max-sm:[&>*]:justify-center sm:flex-row sm:flex-wrap sm:items-center sm:shrink-0">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
