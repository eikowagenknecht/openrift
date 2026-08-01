/**
 * Error text of a thrown value, for matching against known ort failures.
 *
 * The ort proxy worker serializes worker-side failures back over postMessage,
 * so the thrown value is not always an Error instance.
 *
 * @returns The message of an Error, or the stringified value.
 */
function errorText(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

const OUT_OF_MEMORY_PATTERN = /out of memory|cannot enlarge memory|\boom\b/iu;

/**
 * Whether a failed `InferenceSession.create` is worth retrying in this page.
 *
 * onnxruntime resolves its wasm backend once per page: when backend init
 * itself fails (out of memory compiling the wasm or spawning the proxy
 * worker), ort marks the backend aborted and every later create fast-fails
 * with "no available backend found" without ever re-running init. Only a
 * create failure past backend init (loading the model into the session) can
 * succeed on a second try.
 *
 * @returns True when the backend is still alive, so a retry can help.
 */
export function encoderCreateRetryable(thrown: unknown): boolean {
  return !errorText(thrown).includes("no available backend found");
}

/**
 * Human-readable message for a failed encoder start.
 *
 * Out-of-memory failures surface as developer-speak ("no available backend
 * found. ERR: [wasm] ... Out of memory"), and once the backend has aborted
 * the only recovery is a fresh tab (observed on iOS under tab memory
 * pressure). Map those to a message telling the user what to do; other
 * errors keep their own message.
 *
 * @returns A user-facing message for the failure.
 */
export function encoderStartErrorMessage(thrown: unknown, fallback: string): string {
  if (OUT_OF_MEMORY_PATTERN.test(errorText(thrown))) {
    return "The browser ran out of memory while starting the scanner. Close unused tabs, then open this page again in a new tab.";
  }
  if (thrown instanceof Error && thrown.message) {
    return thrown.message;
  }
  return fallback;
}
