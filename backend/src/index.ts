import { createApp } from './app.js';
import { startOutboxWorker } from './services/outbox-worker.js';
import { startTranslationWorker } from './services/translation-worker.js';

const app = createApp();

const port = Number(process.env.PORT ?? 4270);
app.listen(port, () => {
  console.log(`[api] ${process.env.FORJIO_SERVICE ?? 'locavello'} listening on ${port}`);
});

// Outbox worker runs alongside the API process. For production, prefer a
// separate pm2 entry: `node dist/services/outbox-worker.js`. Tests
// (`NODE_ENV=test`) keep the worker off so stray deliveries don't leak.
const outboxDefaultOff = process.env.NODE_ENV === 'test';
const outboxEnabled = process.env.OUTBOX_WORKER_ENABLED
  ? process.env.OUTBOX_WORKER_ENABLED !== 'false'
  : !outboxDefaultOff;
if (outboxEnabled) {
  startOutboxWorker().catch((e) => {
    console.error('[outbox] fatal', e);
    process.exit(1);
  });
}

// Translation worker — the agent machine-pass consumer. Runs alongside
// the API like the outbox worker; requires CATENTIO_API_KEY. Off in
// tests, and off (with a loud log) when the key is absent so a
// misconfigured box degrades to human-only translation, not a crash.
const translateEnabled = process.env.TRANSLATION_WORKER_ENABLED
  ? process.env.TRANSLATION_WORKER_ENABLED !== 'false'
  : !outboxDefaultOff;
if (translateEnabled) {
  if (!process.env.CATENTIO_API_KEY) {
    console.error('[translate] CATENTIO_API_KEY missing — agent translation disabled');
  } else {
    startTranslationWorker().catch((e) => {
      console.error('[translate] fatal', e);
    });
  }
}
