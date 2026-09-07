// Without an AbortController, the underlying fetch keeps running in the
// background on timeout and the server may still succeed after the UI has
// already rolled back.

const DEFAULT_TIMEOUT_MS = 5000;

interface WithTimeoutOptions {
  label: string;
  timeoutMs?: number;
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
