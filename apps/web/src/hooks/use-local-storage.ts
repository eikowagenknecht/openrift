import { useCallback, useState } from "react";

export function useLocalStorage<T>(
  key: string,
  initialValue: T,
  serialize: (value: T) => string = JSON.stringify,
  deserialize: (raw: string) => T = JSON.parse,
): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key);
      return item !== null ? deserialize(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStoredValue((prev) => {
        const next = typeof value === "function" ? (value as (prev: T) => T)(prev) : value;
        localStorage.setItem(key, serialize(next));
        return next;
      });
    },
    [key, serialize],
  );

  return [storedValue, setValue];
}
