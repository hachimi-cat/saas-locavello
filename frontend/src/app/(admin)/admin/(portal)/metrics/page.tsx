'use client';

/*
 * Business metrics — MANDATORY admin-portal standard.
 * Body comes from @forjio/admin-ui; the data comes from this product's
 * adapter in backend/src/lib/business-metrics.ts.
 *
 * FORKERS: add product tiles via `extraTiles` (GPU hours, tickets
 * resolved, links created). They render AFTER the standard tiles so the
 * first row reads the same across every Forjio product.
 */

import { BusinessMetricsPanel } from '@forjio/admin-ui';

export default function AdminMetricsPage() {
  return <BusinessMetricsPanel />;
}
