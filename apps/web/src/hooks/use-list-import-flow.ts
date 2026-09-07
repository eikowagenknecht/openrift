import { useRef, useState } from "react";
import { toast } from "sonner";

import type { ImportStep } from "@/hooks/import-flow-shared";
import {
  createImportEntryHandlers,
  deriveImportSummary,
  handleImportFileUpload,
  IMPORT_BATCH_SIZE,
  runImportParse,
  STATUS_SORT_ORDER,
} from "@/hooks/import-flow-shared";
import { useCards } from "@/hooks/use-cards";
import { useBulkAddListEntries } from "@/hooks/use-lists";
import type { MatchedEntry } from "@/lib/import-matcher";
import { matchEntries } from "@/lib/import-matcher";
import { useDisplayStore } from "@/stores/display-store";

/** List kinds that support text/CSV import. Copy-kind has no source-file identity. */
export type ImportableListKind = "card" | "printing";

export function useListImportFlow(
  listId: string,
  listKind: ImportableListKind,
  onClose: () => void,
) {
  const { allPrintings } = useCards();
  const bulkAddEntries = useBulkAddListEntries();
  const preferredLanguages = useDisplayStore((state) => state.languages);

  const [step, setStep] = useState<ImportStep>("input");
  const [rawText, setRawText] = useState("");
  const [matchedEntries, setMatchedEntries] = useState<MatchedEntry[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [skippedIndices, setSkippedIndices] = useState<Set<number>>(new Set());
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set());
  const [rowCount, setRowCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep("input");
    setRawText("");
    setMatchedEntries([]);
    setParseErrors([]);
    setSkippedIndices(new Set());
    setExpandedIndices(new Set());
    setRowCount(0);
  };

  const handleParse = (text: string) => {
    runImportParse(
      text,
      (entries) => {
        const matched = matchEntries(entries, allPrintings, preferredLanguages[0]).map((entry) =>
          listKind === "card" ? promoteToExact(entry) : entry,
        );
        return matched.toSorted((entryA, entryB) => {
          const statusDiff = STATUS_SORT_ORDER[entryA.status] - STATUS_SORT_ORDER[entryB.status];
          if (statusDiff !== 0) {
            return statusDiff;
          }
          return entryA.entry.cardName.localeCompare(entryB.entry.cardName);
        });
      },
      {
        setRowCount,
        setParseErrors,
        setMatchedEntries,
        setSkippedIndices,
        setExpandedIndices,
        setStep,
      },
    );
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    void handleImportFileUpload(event, fileRef, setRawText, handleParse);
  };

  const { handleResolve, handleSkip, handleUnskip, handleToggleExpand } = createImportEntryHandlers(
    setMatchedEntries,
    setSkippedIndices,
    setExpandedIndices,
  );

  const { importableEntries, summary, skippedCount } = deriveImportSummary(
    matchedEntries,
    skippedIndices,
  );

  const handleImport = async () => {
    if (importableEntries.length === 0) {
      toast.error("Nothing to import.");
      return;
    }

    setIsImporting(true);

    const payload = buildListImportPayload(importableEntries, listKind);

    const batches: (typeof payload)[] = [];
    for (let offset = 0; offset < payload.length; offset += IMPORT_BATCH_SIZE) {
      batches.push(payload.slice(offset, offset + IMPORT_BATCH_SIZE));
    }

    const sendAllBatches = async () => {
      for (const batch of batches) {
        await bulkAddEntries.mutateAsync({ listId, entries: batch });
      }
    };

    const cardLabel = summary.totalCards === 1 ? "card" : "cards";

    try {
      await sendAllBatches();
      toast.success(`Added ${summary.totalCards} ${cardLabel} to list.`);
      setIsImporting(false);
      reset();
      onClose();
    } catch {
      // Deliberate second toast on top of the global mutation error one: this says the
      // import was left half-done (batches before the failing one already committed).
      toast.error("Import failed. Some cards may have been added.");
      setIsImporting(false);
    }
  };

  return {
    step,
    rawText,
    matchedEntries,
    parseErrors,
    isImporting,
    skippedIndices,
    expandedIndices,
    rowCount,
    fileRef,
    allPrintings,

    readyCount: summary.readyCount,
    toVerifyCount: summary.toVerifyCount,
    needsAttentionCount: summary.needsAttentionCount,
    importableCount: summary.importableCount,
    skippedCount,
    totalCards: summary.totalCards,

    handleRawTextChange: setRawText,
    handleParse,
    handleFileUpload,
    handleResolve,
    handleSkip,
    handleUnskip,
    handleToggleExpand,
    handleImport,
    handleBack: () => setStep("input"),
    reset,
  };
}

/** A single bulk-add list entry: either a cardId (card-kind) or printingId (printing-kind). */
export interface ListImportPayloadEntry {
  cardId?: string;
  printingId?: string;
  quantity: number;
}

export function buildListImportPayload(
  readyEntries: MatchedEntry[],
  listKind: ImportableListKind,
): ListImportPayloadEntry[] {
  return readyEntries.map((entry) =>
    listKind === "printing"
      ? { printingId: entry.resolvedPrinting?.id ?? "", quantity: entry.entry.quantity }
      : { cardId: entry.resolvedPrinting?.cardId ?? "", quantity: entry.entry.quantity },
  );
}

/**
 * Card-kind lists only need a cardId: a `needs-review` match with several printings
 * of one card is promoted to `exact`. Multi-card ambiguity is left for manual resolution.
 */
export function promoteToExact(matched: MatchedEntry): MatchedEntry {
  if (matched.status === "exact" || matched.candidates.length === 0) {
    return matched;
  }
  const cardIds = new Set(matched.candidates.map((printing) => printing.cardId));
  if (cardIds.size !== 1) {
    return matched;
  }
  return {
    ...matched,
    status: "exact",
    resolvedPrinting: matched.resolvedPrinting ?? matched.candidates[0] ?? null,
  };
}
