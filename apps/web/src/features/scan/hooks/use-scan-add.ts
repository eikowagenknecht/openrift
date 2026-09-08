import type { CollectionResponse } from "@openrift/shared/types/api/collection";
import type { Printing } from "@openrift/shared/types/catalog";
import { useState } from "react";
import { toast } from "sonner";

import { useBatchedAddCopies, useDisposeCopies } from "@/features/collections/hooks/use-copies";
import { useWishEntries } from "@/features/groups/hooks/use-wish-entries";
import type { WishEntryFlat } from "@/features/groups/lib/wish-entry";
import { cardWord } from "@/features/scan/lib/scan-card-word";
import { addInChunks, addJobsFor, reconcileJobs, settleAdd } from "@/features/scan/lib/scan-commit";
import { appendScanJournal } from "@/features/scan/lib/scan-journal";
import type { ScanSessionRow } from "@/features/scan/stores/scan-session-store";
import { useScanSessionStore } from "@/features/scan/stores/scan-session-store";
import { randomUuid } from "@/lib/random-uuid";

interface WishFollowUp {
  printing: Printing;
  entries: WishEntryFlat[];
  taken: number;
}

interface ScanAdd {
  adding: boolean;
  failedCount: number;
  resetFailedCount: () => void;
  addAll: (collectionId: string) => Promise<void>;
  followUp: WishFollowUp | null;
  dismissFollowUp: () => void;
}

export function useScanAdd(collections: CollectionResponse[]): ScanAdd {
  const batchedAdd = useBatchedAddCopies();
  const disposeCopies = useDisposeCopies();
  const wish = useWishEntries(true);

  const [adding, setAdding] = useState(false);
  const [failedCount, setFailedCount] = useState(0);
  const [wishFollowUps, setWishFollowUps] = useState<WishFollowUp[]>([]);

  const pendingAdd = useScanSessionStore((state) => state.pending);
  let shownFailedCount = failedCount;
  if (adding) {
    shownFailedCount = 0;
  } else if (failedCount === 0 && pendingAdd !== null) {
    shownFailedCount = pendingAdd.jobs.length;
  }

  async function handleUndoAdd(batchId: string, copyIds: string[], rows: ScanSessionRow[]) {
    if (copyIds.length === 0) {
      return;
    }
    try {
      await disposeCopies.mutateAsync({ copyIds });
      appendScanJournal({ type: "undo-add", batchId, copies: copyIds.length });
      useScanSessionStore.getState().putBack(rows);
    } catch {
      // Reported by the global mutation error toast.
    }
  }

  async function addAll(collectionId: string) {
    const store = useScanSessionStore.getState();
    const rowsNow = [...store.rows.values()];
    const reusable = store.pending?.collectionId === collectionId ? store.pending : null;
    const jobs = reusable ? reconcileJobs(reusable.jobs, rowsNow) : addJobsFor(rowsNow);
    if (jobs.length === 0) {
      return;
    }
    const batchId = reusable ? reusable.batchId : randomUuid();
    store.setPending({ batchId, collectionId, jobs });
    appendScanJournal({ type: "add-start", batchId, collectionId, jobs: jobs.length });
    setAdding(true);
    setFailedCount(0);
    const outcomes = await addInChunks(
      jobs,
      (job) => batchedAdd.add(job.printingId, collectionId, job.id, batchId).result,
    );
    setAdding(false);
    const { confirmed, copyIds, failed } = settleAdd(jobs, outcomes);
    appendScanJournal({ type: "add-settled", batchId, confirmed: copyIds.length, failed });
    useScanSessionStore.getState().take(confirmed);
    setFailedCount(failed);
    if (failed === 0) {
      useScanSessionStore.getState().clearPending();
    }
    if (confirmed.size > 0) {
      useScanSessionStore.getState().dismissResumed();
    }

    const confirmedRows = rowsNow
      .map((row) => ({ printing: row.printing, count: confirmed.get(row.printing.id) ?? 0 }))
      .filter((row) => row.count > 0);
    const added = jobs.length - failed;
    const collectionName =
      collections.find((collection) => collection.id === collectionId)?.name ?? "your collection";
    if (added > 0) {
      toast.success(`Added ${added} ${cardWord(added)} to ${collectionName}`, {
        action: {
          label: "Undo",
          onClick: () => void handleUndoAdd(batchId, copyIds, confirmedRows),
        },
      });
    }
    const followUps = confirmedRows
      .map((row) => ({
        printing: row.printing,
        taken: row.count,
        entries: wish.entriesForPrinting(row.printing.cardId, row.printing.id),
      }))
      .filter((item) => item.entries.length > 0);
    if (followUps.length > 0) {
      setWishFollowUps(followUps);
    }
  }

  function resetFailedCount() {
    setFailedCount(0);
  }

  function dismissFollowUp() {
    setWishFollowUps((queue) => queue.slice(1));
  }

  return {
    adding,
    failedCount: shownFailedCount,
    resetFailedCount,
    addAll,
    followUp: wishFollowUps[0] ?? null,
    dismissFollowUp,
  };
}
