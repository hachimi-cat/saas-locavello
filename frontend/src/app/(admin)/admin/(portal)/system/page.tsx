'use client';

/*
 * System metrics — MANDATORY admin-portal standard.
 * Reads GET /api/v1/console/admin/system-health, which reaches the
 * database and every configured integration. Polls at 30s; do not lower
 * it, each poll costs a round trip to every dependency.
 */

import { SystemHealthPanel } from '@forjio/admin-ui';

export default function AdminSystemPage() {
  return <SystemHealthPanel />;
}
