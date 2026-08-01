'use client';

/*
 * Feature flags — MANDATORY admin-portal standard.
 *
 * Flipping a flag changes runtime behaviour for EVERY user of this
 * deployment, which is why it lives here behind adminGuard and not in the
 * customer portal. Flags are declared in code with `ensureFeatureFlag()`;
 * this page toggles them, it does not create them.
 */

import { FeatureFlagsPanel } from '@forjio/admin-ui';

export default function AdminFeatureFlagsPage() {
  return <FeatureFlagsPanel />;
}
