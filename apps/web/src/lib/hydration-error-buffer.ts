// Hydration errors fire during the very first hydrateRoot() commit — before the
// lazily-imported Sentry client has finished initializing in getRouter()
// (router.ts). captureException against an uninitialized hub is a no-op, so
// those events were silently dropped (the only trace was client.tsx's
// console.error). This buffer bridges the gap: the hydrateRoot callbacks push
// here synchronously, so the entry chunk never imports Sentry, and
// initClientSentry() drains the queue once Sentry is armed. A recoverable
// mismatch always flushes, since the page recovers and init proceeds normally.

export type HydrationErrorPhase = "recoverable" | "uncaught" | "caught";

export interface BufferedHydrationError {
  phase: HydrationErrorPhase;
  error: unknown;
  componentStack?: string | null;
}

// Safety valve: a pathological remount loop that re-throws on every commit
// could otherwise grow the queue without bound before Sentry arms. Hydration
// errors realistically fire once per page load, so this cap is never reached in
// practice.
const MAX_BUFFERED = 50;

const buffered: BufferedHydrationError[] = [];
let sink: ((entry: BufferedHydrationError) => void) | null = null;

/**
 * Record a hydration error, or forward it immediately when Sentry is already
 * armed. Safe to call before Sentry initializes — the entry is queued and later
 * flushed by {@link drainHydrationErrors}. Drops silently once the queue holds
 * {@link MAX_BUFFERED} unflushed entries.
 *
 * @returns Nothing.
 */
export function bufferHydrationError(entry: BufferedHydrationError): void {
  if (sink) {
    sink(entry);
    return;
  }
  if (buffered.length < MAX_BUFFERED) {
    buffered.push(entry);
  }
}

/**
 * Register the capture sink and flush everything queued before Sentry was
 * ready. After this runs, subsequent {@link bufferHydrationError} calls forward
 * straight to `capture` without queuing.
 *
 * @returns Nothing.
 */
export function drainHydrationErrors(capture: (entry: BufferedHydrationError) => void): void {
  sink = capture;
  for (const entry of buffered.splice(0)) {
    capture(entry);
  }
}
