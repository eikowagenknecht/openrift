import type { Printing } from "@openrift/shared/types/catalog";
import { legendDisplayName } from "@openrift/shared/utils";
import { useState } from "react";

import type { PickerRequest } from "@/features/scan/lib/scan-resolve";
import { sortForPicker } from "@/features/scan/lib/scan-resolve";
import type { ScanSessionRow } from "@/features/scan/stores/scan-session-store";
import { useScanSessionStore } from "@/features/scan/stores/scan-session-store";

interface ScanSwap {
  row: ScanSessionRow | null;
  request: PickerRequest | null;
  select: (row: ScanSessionRow) => void;
  pick: (printing: Printing) => void;
  dismiss: () => void;
}

export function useScanSwap(allPrintings: Printing[]): ScanSwap {
  const [row, setRow] = useState<ScanSessionRow | null>(null);

  const request: PickerRequest | null = row
    ? {
        artKey: "",
        label: legendDisplayName(row.printing.card),
        candidates: sortForPicker(
          allPrintings.filter((printing) => printing.cardId === row.printing.cardId),
        ),
        currentId: row.printing.id,
      }
    : null;

  function pick(printing: Printing) {
    const current = row;
    setRow(null);
    if (!current || printing.id === current.printing.id) {
      return;
    }
    useScanSessionStore.getState().move(current.printing.id, printing);
  }

  function dismiss() {
    setRow(null);
  }

  return { row, request, select: setRow, pick, dismiss };
}
