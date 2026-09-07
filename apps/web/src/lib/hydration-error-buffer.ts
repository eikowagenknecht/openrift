// Hydration errors can fire before the lazily-imported Sentry client
// initializes; this queues them until initClientSentry() drains it.

export type HydrationErrorPhase = "recoverable" | "uncaught" | "caught";

export interface BufferedHydrationError {
  phase: HydrationErrorPhase;
  duringHydration: boolean;
  error: unknown;
  componentStack?: string | null;
}

const MAX_BUFFERED = 50;

const buffered: BufferedHydrationError[] = [];
let sink: ((entry: BufferedHydrationError) => void) | null = null;

export function bufferHydrationError(entry: BufferedHydrationError): void {
  if (sink) {
    sink(entry);
    return;
  }
  if (buffered.length < MAX_BUFFERED) {
    buffered.push(entry);
  }
}

export function drainHydrationErrors(capture: (entry: BufferedHydrationError) => void): void {
  sink = capture;
  for (const entry of buffered.splice(0)) {
    capture(entry);
  }
}
