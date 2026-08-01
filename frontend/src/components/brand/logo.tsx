import { cn } from '@/lib/utils';

/*
 * Locavello brand mark — the lucide "Languages" glyph (latin A +
 * ideograph stroke crossing), the same geometry embedded in
 * src/app/icon.svg with literal colors. Stroke from `currentColor`
 * so the family token system colors it (amber `text-primary` on
 * dark). Keep in sync with src/app/icon.svg.
 */

export function LocavelloMark({
  size = 20,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5 8 6 6" />
      <path d="m4 14 6-6 2-3" />
      <path d="M2 5h12" />
      <path d="M7 2h1" />
      <path d="m22 22-5-10-5 10" />
      <path d="M14 18h6" />
    </svg>
  );
}

/** Mark + "Locavello" wordmark, for headers/footers. */
export function LocavelloLogo({
  markSize = 22,
  className,
  wordmarkClassName,
}: {
  markSize?: number;
  className?: string;
  wordmarkClassName?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LocavelloMark size={markSize} className="text-primary" />
      <span
        className={cn(
          'font-display text-lg font-semibold tracking-tight text-foreground',
          wordmarkClassName,
        )}
      >
        Locavello
      </span>
    </span>
  );
}
