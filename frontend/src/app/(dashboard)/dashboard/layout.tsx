import { Toaster } from '@/components/ui/sonner';

/**
 * Dashboard section layout. The auth gate + portal shell live one level
 * up in `(dashboard)/layout.tsx`; this layer only mounts the sonner
 * Toaster once for every /dashboard/* page.
 */
export default function DashboardSectionLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster position="bottom-right" />
    </>
  );
}
