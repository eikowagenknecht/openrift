import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";

/** The seed is adopted only while the field still holds the last value it was seeded with. */
export function useServerSeededState<T>(serverValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(serverValue);
  const [seeded, setSeeded] = useState(serverValue);

  // Must run during render, not an effect, or the input shows the superseded value for a frame.
  if (!Object.is(serverValue, seeded)) {
    setSeeded(serverValue);
    if (Object.is(value, seeded)) {
      setValue(serverValue);
    }
  }

  return [value, setValue];
}
