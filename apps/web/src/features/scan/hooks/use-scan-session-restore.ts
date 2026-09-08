import type { Printing } from "@openrift/shared/types/catalog";
import { useEffect } from "react";

import { appendScanJournal } from "@/features/scan/lib/scan-journal";
import { useScanSessionStore } from "@/features/scan/stores/scan-session-store";

export function useScanSessionRestore(allPrintings: Printing[]): void {
  useEffect(() => {
    if (allPrintings.length === 0) {
      return;
    }
    const byId = new Map(allPrintings.map((printing) => [printing.id, printing]));
    const staged = useScanSessionStore.getState().restored !== null;
    useScanSessionStore.getState().restore((printingId) => byId.get(printingId));
    const after = useScanSessionStore.getState();
    let cards = 0;
    for (const row of after.rows.values()) {
      cards += row.count;
    }
    const pendingBatchId = after.pending?.batchId ?? null;
    appendScanJournal({ type: "open", rows: after.rows.size, cards, pending: pendingBatchId });
    if (staged) {
      appendScanJournal({
        type: "restore",
        cards: after.resumed?.cards ?? 0,
        pending: pendingBatchId,
      });
    }
  }, [allPrintings]);
}
