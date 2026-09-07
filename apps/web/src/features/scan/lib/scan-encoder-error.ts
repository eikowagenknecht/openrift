import { errorText } from "@/lib/error-text";

// The ort proxy worker serializes worker-side failures over postMessage: the thrown value is not always an Error.
function matchableText(thrown: unknown): string {
  return errorText(thrown, String(thrown));
}

const OUT_OF_MEMORY_PATTERN = /out of memory|cannot enlarge memory|\boom\b/iu;

// onnxruntime resolves its wasm backend once per page; once backend init
// fails, every later create fast-fails without re-running init.
export function encoderCreateRetryable(thrown: unknown): boolean {
  return !matchableText(thrown).includes("no available backend found");
}

// Out-of-memory failures surface as developer-speak; the only recovery is a
// fresh tab (observed on iOS under tab memory pressure), so map to that.
export function encoderStartErrorMessage(thrown: unknown, fallback: string): string {
  if (OUT_OF_MEMORY_PATTERN.test(matchableText(thrown))) {
    return "The browser ran out of memory while starting the scanner. Close unused tabs, then open this page again in a new tab.";
  }
  if (thrown instanceof Error && thrown.message) {
    return thrown.message;
  }
  return fallback;
}
