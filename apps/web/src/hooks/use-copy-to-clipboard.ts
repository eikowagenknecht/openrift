import { useEffect, useRef, useState } from "react";

/** How long the "Copied" confirmation stays up before reverting. */
const RESET_DELAY_MS = 1500;

interface UseCopyToClipboard {
  /** True for `RESET_DELAY_MS` after a successful copy. */
  copied: boolean;
  /** Writes `text` to the clipboard. Resolves false when the write was denied. */
  copy: (text: string) => Promise<boolean>;
  /**
   * Clears the confirmation immediately. For surfaces that outlive the window,
   * like a dialog reopened with a different value before the timer elapsed.
   */
  reset: () => void;
}

/**
 * Clipboard write plus the transient "Copied" flag every share surface shows.
 *
 * Clipboard writes reject on their own (permission denied, insecure context,
 * Safari losing the user-gesture window), so the failure path is swallowed and
 * reported through the return value. The text is on screen and selectable in
 * every place this is used, so a failed write is a non-event rather than
 * something worth interrupting the user over.
 *
 * @returns The `copied` flag, a `copy` function and a `reset` function.
 */
export function useCopyToClipboard(): UseCopyToClipboard {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);

  const clearTimer = () => {
    if (timer.current !== null) {
      globalThis.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  useEffect(() => clearTimer, []);

  const copy = async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Denied or unavailable. The text stays selectable on screen.
      return false;
    }
    setCopied(true);
    // Restart the window on a repeat copy so the confirmation always lasts the
    // full delay from the most recent click.
    clearTimer();
    timer.current = globalThis.setTimeout(() => setCopied(false), RESET_DELAY_MS);
    return true;
  };

  const reset = () => {
    clearTimer();
    setCopied(false);
  };

  return { copied, copy, reset };
}
