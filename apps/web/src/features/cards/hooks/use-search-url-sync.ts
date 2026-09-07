import { useDebouncedValue } from "@tanstack/react-pacer";
import { useEffect, useRef, useState } from "react";

interface Options {
  urlValue: string;
  onCommit: (value: string) => void;
  delay?: number;
}

/**
 * `onCommit` triggers an async navigate, so `urlValue` lags behind. `lastSentValue`
 * lets a commit-echoing `urlValue` update be told apart from a real external change.
 */
export function useSearchUrlSync({ urlValue, onCommit, delay = 200 }: Options) {
  const [localValue, setLocalValue] = useState(urlValue);
  const [debouncedValue] = useDebouncedValue(localValue, { wait: delay });

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
