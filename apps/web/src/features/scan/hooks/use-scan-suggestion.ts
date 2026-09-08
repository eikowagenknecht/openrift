import { useState } from "react";

import type { AimHint } from "@/features/scan/lib/scan-aim-hint";
import type { LoadedScanBank } from "@/features/scan/lib/scan-bank";
import { describeKey } from "@/features/scan/lib/scan-bank";
import type { LockedCard } from "@/features/scan/lib/scan-locks";
import type { ScannerReadout } from "@/features/scan/lib/scan-readout";

const AIM_SUGGEST_SECONDS = 3;

interface ScanSuggestionOptions {
  active: boolean;
  blocked: boolean;
  loaded: LoadedScanBank | null;
  readout: ScannerReadout;
  onLock: (lock: Pick<LockedCard, "key" | "artKey" | "label" | "resolved">) => void;
}

interface ScanSuggestion {
  showing: boolean;
  label: string | null;
  hint: AimHint | null;
  add: () => void;
  dismiss: () => void;
}

export function useScanSuggestion({
  active,
  blocked,
  loaded,
  readout,
  onLock,
}: ScanSuggestionOptions): ScanSuggestion {
  const [dismissedSuggestion, setDismissedSuggestion] = useState<string | null>(null);

  const aim = readout.aim;
  const dismissalStale =
    aim !== null && dismissedSuggestion !== null && aim.artKey !== dismissedSuggestion;
  if (dismissalStale) {
    setDismissedSuggestion(null);
  }

  const suggestion =
    active &&
    aim !== null &&
    aim.seconds >= AIM_SUGGEST_SECONDS &&
    readout.winnerKey === null &&
    aim.artKey !== dismissedSuggestion &&
    !blocked
      ? aim
      : null;
  const label = suggestion && loaded ? describeKey(loaded.labels, suggestion.key) : null;

  function add() {
    if (!suggestion || !label) {
      return;
    }
    setDismissedSuggestion(suggestion.artKey);
    onLock({
      key: suggestion.key,
      artKey: suggestion.artKey,
      label,
      resolved: false,
    });
  }

  function dismiss() {
    if (suggestion) {
      setDismissedSuggestion(suggestion.artKey);
    }
  }

  return {
    showing: suggestion !== null,
    label,
    hint: suggestion === null && active ? readout.aimHint : null,
    add,
    dismiss,
  };
}
