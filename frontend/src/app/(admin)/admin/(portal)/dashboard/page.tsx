'use client';

/*
 * Admin dashboard — MANDATORY admin-portal standard.
 *
 * This used to be a dashed-border placeholder telling forkers to invent
 * their own admin overview, and thirteen products duly invented thirteen
 * different ones. It now composes the three standard contracts (business
 * metrics, system health, feature flags) and nothing else — if something
 * belongs on the overview it belongs in one of those three.
 *
 * The admin auth gate + portal shell live in the route-group layout
 * (`(admin)/admin/(portal)/layout.tsx`); this page is just the content.
 * Data is fetched through the admin BFF proxy at `/api/v1/console/*`,
 * which stamps the admin role header — no secret in the browser.
 *
 * FORKERS: put YOUR product's admin surfaces in `quickLinks`. That is the
 * "on top of the standard" slot — pawpado's reconcile, plugipay's
 * kyc-inbox, serront's orders. rename.sh rewrites the display name.
 */

import { AdminOverviewPanel } from '@forjio/admin-ui';

const brand = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Forjio Brand';

export default function AdminDashboardPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <AdminOverviewPanel
        brand={brand}
        quickLinks={[
          {
            href: '/admin/customers',
            label: 'Customers',
            description: 'Everyone signed into this product via Huudis SSO.',
          },
        ]}
      />
    </div>
  );
}
