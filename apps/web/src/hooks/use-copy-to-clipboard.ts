import { useEffect, useRef, useState } from "react";

const RESET_DELAY_MS = 1500;

interface UseCopyToClipboard {
  copied: boolean;
  copy: (text: string) => Promise<boolean>;
  reset: () => void;
}

export async function copyTextToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

/** A denied or unavailable write returns false; it never throws. */
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
      return false;
    }
    setCopied(true);
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
