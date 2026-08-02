import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";

/**
 * Local form state seeded from a server value on an always-mounted form.
 *
 * A background refetch (poll, window focus) replaces the server value while the
 * user may be mid-edit. Re-seeding unconditionally would wipe what they typed,
 * and never re-seeding leaves the field showing whatever the first render saw,
 * so the "has this changed?" comparison ends up diffing stale local state
 * against fresh server data. The seed is therefore adopted only while the field
 * still holds the value we last seeded it with: an untouched field tracks the
 * server, an edited one keeps the edit until it is saved.
 *
 * Dialogs don't need this. They seed on the open transition instead, which also
 * resets an edit the user cancelled out of.
 * @param serverValue The current server-owned value.
 * @returns The local value and its setter, with the same shape as `useState`.
 */
export function useServerSeededState<T>(serverValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(serverValue);
  const [seeded, setSeeded] = useState(serverValue);

  // Render-phase adjustment rather than an effect: React re-runs the component
  // before painting, so the input never shows the superseded value for a frame.
  if (!Object.is(serverValue, seeded)) {
    setSeeded(serverValue);
    if (Object.is(value, seeded)) {
      setValue(serverValue);
    }
  }

  return [value, setValue];
}
