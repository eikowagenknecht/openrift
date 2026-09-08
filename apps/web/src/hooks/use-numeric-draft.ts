import type { ChangeEvent } from "react";
import { useState } from "react";

interface NumericDraft {
  inputProps: {
    value: string;
    onChange: (event: ChangeEvent<HTMLInputElement>) => void;
    onBlur: () => void;
  };
  resetDraft: () => void;
}

// The typed text wins over `display` until the field is left, so backspacing
// to an empty field doesn't snap back to the clamped number under the cursor.
export function useNumericDraft({
  display,
  onCommit,
}: {
  display: string;
  onCommit: (text: string) => void;
}): NumericDraft {
  const [draft, setDraft] = useState<string | null>(null);
  return {
    inputProps: {
      value: draft ?? display,
      onChange: (event: ChangeEvent<HTMLInputElement>) => {
        setDraft(event.target.value);
        onCommit(event.target.value);
      },
      onBlur: () => setDraft(null),
    },
    resetDraft: () => setDraft(null),
  };
}
