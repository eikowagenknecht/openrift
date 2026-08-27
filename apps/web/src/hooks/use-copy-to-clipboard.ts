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
 * Writes `text` to the clipboard, for the surfaces that show their own feedback
 * (a toast, a dropdown that closes) rather than the hook's inline "Copied".
 *
 * Rejects the way the platform API does, so the caller decides what a denied
 * write means. Prefer {@link useCopyToClipboard} inside a component.
 *
 * @returns A promise that settles when the write does.
 */
export async function copyTextToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
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

  useEffect(
    () => () => {
      if (timer.current !== null) {
        globalThis.clearTimeout(timer.current);
      }
    },
    [],
  );

  const copy = async (text: string): Promise<boolean> => {
    try {
      await copyTextToClipboard(text);
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
