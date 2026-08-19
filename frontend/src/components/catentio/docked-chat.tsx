'use client';

import { useCallback, useMemo, useState } from 'react';
import { LocavelloMark } from '@/components/brand/logo';
import { DockedChat, createBffChatAdapters, type ChatAction } from '@forjio/agent-ui';
import { catentioHttp } from '@/lib/catentio-http';
import { applyChatAction } from '@/components/catentio/chat-actions';
import { useCatentioStatus, ASSISTANT_ACTIVITY_EVENT } from '@/hooks/use-catentio';
import { ApiRequestError } from '@/lib/api';

/**
 * The docked product chat — locavello's mount of the embedded agent layer
 * (linksnap's docked-chat.tsx is the reference). Renders nothing unless
 * the catentio pilot flag is on for this account (the backend re-checks
 * on every call regardless). Docked bottom-right: resting, only the
 * composer bar shows; focus/submit grows the panel in place.
 */
export function CatentioDockedChat() {
  const { enabled } = useCatentioStatus();
  const [open, setOpen] = useState(false);
  // ONE adapter set per mount — an inline object per render would
  // restart the package's poll/save machinery.
  const adapters = useMemo(
    () => createBffChatAdapters(catentioHttp, { activityEventName: ASSISTANT_ACTIVITY_EVENT }),
    [],
  );

  // The chat's Apply path (review mode): the agent PROPOSED the card,
  // this executes it with the user's own session via the same
  // api-client calls the dashboard pages use (chat-actions.ts).
  const onApplyAction = useCallback(
    async (action: ChatAction, earlier: { action: ChatAction; result?: unknown }[]) => {
      try {
        return await applyChatAction(action, earlier);
      } catch (err) {
        // Surface what the SERVER said — a bare "Request failed" hides
        // the exact rejection the user needs to see on the card.
        throw new Error(
          err instanceof ApiRequestError || err instanceof Error
            ? err.message
            : 'That change could not be applied',
        );
      }
    },
    [],
  );

  if (!enabled) return null;

  // Insets mirror <main>'s padding so the dock lines up with the page
  // content (linksnap's layout decision, 2026-08-05). locavello's shell
  // pads `p-4 md:p-6` (dashboard-shell.tsx), so the step is at `md:`
  // here — copying linksnap's `sm:` verbatim left the dock 8px inside
  // the content between 640 and 767px (the same defect ripllo fixed in
  // its Phase 5, e919d93). Expanded: full SCREEN below md (fixed
  // inset-0 over everything), full column height above it at the same
  // content width.
  return (
    <div
      className={
        open
          ? 'fixed inset-0 z-50 flex flex-col md:absolute md:inset-x-6 md:bottom-6 md:top-6 md:z-40 md:mx-auto md:max-w-4xl'
          : 'absolute inset-x-4 bottom-4 z-40 mx-auto flex max-w-4xl flex-col md:inset-x-6 md:bottom-6'
      }
    >
      <DockedChat
        adapters={adapters}
        product="locavello"
        open={open}
        onOpenChange={setOpen}
        title="Locavello Assistant"
        // The assistant's bubble avatar. Served from public/ — until
        // 2026-08-19 this pointed at a file locavello never shipped
        // (the value was copied from linksnap, which ships one), and
        // every reply carried the browser's broken-image glyph.
        avatarUrl="/apple-touch-icon.png"
        brandIcon={<LocavelloMark />}
        // Starter prompts on a new session (bang, 2026-08-08: a greeting
        // and three ways in). Phrased as the merchant talking, not as
        // menu items, and drawn from what the agent can actually finish
        // here — the GLOSSARY is the one writable surface (the live
        // agent prompt and catentio-profile.ts both refuse translations,
        // keys, releases and jobs). Clicking SENDS.
        suggestions={[
          'Add our brand names to the glossary as do-not-translate',
          'Force our preferred French translation for a term',
          'Show me our glossary terms and what each one enforces',
        ]}
        onApplyAction={onApplyAction}
      />
    </div>
  );
}
