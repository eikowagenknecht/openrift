import { useEffect, useRef, useState } from "react";

import { useDebounce } from "@/hooks/use-debounce";

interface Options {
  urlValue: string;
  onCommit: (value: string) => void;
  delay?: number;
}

/**
 * Two-way sync between a controlled text input and a URL-backed value.
 *
 * Local state drives the input for immediate feedback. After `delay` ms, the
 * debounced value is pushed to the URL via `onCommit`. External URL changes
 * (e.g. "clear all" buttons) are synced back into local state.
 *
 * The key correctness concern: `onCommit` typically triggers an async router
 * navigate, so `urlValue` lags our commits. We track the last-committed value
 * in `lastSentRef` so filter updates that match our own commit are not
 * mistaken for external changes — otherwise a race during fast typing would
 * clobber the input with the stale URL value.
 * @returns The current local value and its setter.
 */
export function useSearchUrlSync({ urlValue, onCommit, delay = 200 }: Options) {
  const [localValue, setLocalValue] = useState(urlValue);
  const debouncedValue = useDebounce(localValue, delay);

  const prevUrlValue = useRef(urlValue);
  const lastSentValue = useRef(urlValue);

  useEffect(() => {
    if (urlValue !== prevUrlValue.current) {
      prevUrlValue.current = urlValue;
      if (urlValue !== lastSentValue.current) {
        lastSentValue.current = urlValue;
        setLocalValue(urlValue);
      }
      return;
    }

    if (debouncedValue !== urlValue && debouncedValue !== lastSentValue.current) {
      lastSentValue.current = debouncedValue;
      onCommit(debouncedValue);
    }
  }, [debouncedValue, urlValue, onCommit]);

  return [localValue, setLocalValue] as const;
}
