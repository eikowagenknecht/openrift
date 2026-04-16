// Shared timeout wrapper for network calls. If the underlying promise
// doesn't settle within the timeout, rejects with a labelled error — which
// gives callers a chance to roll back optimistic state and surface an error
// toast instead of hanging on a stalled fetch (offline, network partition,
// origin unreachable).
//
// Pass an AbortController to actually cancel the underlying fetch on
// timeout; otherwise the fetch keeps running in the background and the
// server may still succeed after the UI has already rolled back.

export const DEFAULT_TIMEOUT_MS = 5000;

export interface WithTimeoutOptions {
  label: string;
  timeoutMs?: number;
  /**
   * If provided, the controller is aborted on timeout so the underlying
   * fetch cancels instead of running to completion in the background.
   */
  abortController?: AbortController;
}

export function withTimeout<T>(promise: Promise<T>, options: WithTimeoutOptions): Promise<T> {
  const { label, timeoutMs = DEFAULT_TIMEOUT_MS, abortController } = options;
  return Promise.race([
    promise,
    // oxlint-disable-next-line promise/avoid-new -- timeout primitive
    new Promise<T>((_resolve, reject) => {
      setTimeout(() => {
        abortController?.abort();
        reject(new Error(`${label} timed out after ${timeoutMs / 1000}s — check your connection`));
      }, timeoutMs);
    }),
  ]);
}
