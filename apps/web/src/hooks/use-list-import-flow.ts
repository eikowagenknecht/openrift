import type { Printing } from "@openrift/shared";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { useCards } from "@/hooks/use-cards";
import { useBulkAddListEntries } from "@/hooks/use-lists";
import type { MatchStatus, MatchedEntry } from "@/lib/import-matcher";
import { matchEntries } from "@/lib/import-matcher";
import { summarizeMatchedEntries } from "@/lib/import-summary";
import { parseListImport } from "@/lib/list-import-parser";
import { useDisplayStore } from "@/stores/display-store";

/** List kinds that support text/CSV import. Copy-kind has no source-file identity. */
export type ImportableListKind = "card" | "printing";

const STATUS_SORT_ORDER: Record<MatchStatus, number> = {
  unresolved: 0,
  "needs-review": 1,
  exact: 2,
};

const BATCH_SIZE = 500;

type ImportStep = "input" | "preview";

/**
 * Import-flow plumbing for card- and printing-kind lists: parse a deck-text or
 * CSV blob, match it against the catalog, let the user resolve/skip ambiguous
 * rows, then bulk-add the resolved rows to the target list.
 *
 * The write target depends on `listKind`. Card-kind lists store by `cardId` —
 * a specific printing isn't part of the entry — so any name-resolved match
 * counts as exact even when multiple printings of the same card exist; we
 * collapse "single card, multiple printings" back down to `exact` via
 * `promoteToExact`. Printing-kind lists store by `printingId`, so the matcher's
 * `needs-review` status is left intact — the user picks the exact printing.
 * @returns Import flow state and action handlers.
 */
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
    const { entries, errors, rowCount: parsedRowCount } = parseListImport(text);
    setRowCount(parsedRowCount);
    setParseErrors(errors);

    if (entries.length === 0) {
      return;
    }

    // Card-kind lists only need a cardId, so collapse "one card, several
    // printings" ambiguity down to exact. Printing-kind lists need the user to
    // pick the specific printing, so leave needs-review intact.
    const matched = matchEntries(entries, allPrintings, preferredLanguages[0]).map((entry) =>
      listKind === "card" ? promoteToExact(entry) : entry,
    );
    const sorted = matched.toSorted((entryA, entryB) => {
      const statusDiff = STATUS_SORT_ORDER[entryA.status] - STATUS_SORT_ORDER[entryB.status];
      if (statusDiff !== 0) {
        return statusDiff;
      }
      return entryA.entry.cardName.localeCompare(entryB.entry.cardName);
    });
    setMatchedEntries(sorted);
    setSkippedIndices(new Set());

    const nonExact = new Set<number>();
    for (let index = 0; index < sorted.length; index++) {
      if (sorted[index].status !== "exact") {
        nonExact.add(index);
      }
    }
    setExpandedIndices(nonExact);

    setStep("preview");
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const text = await file.text();
    setRawText(text);
    handleParse(text);
    if (fileRef.current) {
      fileRef.current.value = "";
    }
  };

  const handleResolve = (index: number, printing: Printing) => {
    setMatchedEntries((prev) =>
      prev.map((entry, entryIndex) =>
        entryIndex === index
          ? { ...entry, resolvedPrinting: printing, status: "exact" as MatchStatus }
          : entry,
      ),
    );
  };

  const handleSkip = (index: number) => {
    setSkippedIndices((prev) => new Set([...prev, index]));
  };

  const handleUnskip = (index: number) => {
    setSkippedIndices((prev) => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  };

  const handleToggleExpand = (index: number) => {
    setExpandedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const importableEntries = matchedEntries.filter(
    (entry, index) => entry.resolvedPrinting && !skippedIndices.has(index),
  );
  const summary = summarizeMatchedEntries(matchedEntries, skippedIndices);
  const skippedCount = skippedIndices.size;

  const handleImport = async () => {
    if (importableEntries.length === 0) {
      toast.error("Nothing to import.");
      return;
    }

    setIsImporting(true);

    const payload = buildListImportPayload(importableEntries, listKind);

    const batches: (typeof payload)[] = [];
    for (let offset = 0; offset < payload.length; offset += BATCH_SIZE) {
      batches.push(payload.slice(offset, offset + BATCH_SIZE));
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

/**
 * Builds the bulk-add payload from resolved entries, keyed by the list's kind:
 * card-kind lists send `cardId` (the specific printing is irrelevant),
 * printing-kind lists send `printingId` (the exact printing the user resolved).
 * Each entry is expected to have a `resolvedPrinting`; callers filter to ready
 * rows before calling this.
 * @returns One payload entry per resolved row.
 */
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
 * For card-kind lists we only care about the cardId, not the specific
 * printing. So when the matcher returns `needs-review` because it found one
 * card but several printings of it (different finishes, alt arts), promote to
 * `exact` — picking any printing of that card lets us extract the cardId,
 * which is all the import payload needs. Multi-card ambiguity is left for
 * the user to resolve manually.
 * @returns The original entry, or a copy with status bumped to "exact".
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
    resolvedPrinting: matched.resolvedPrinting ?? matched.candidates[0],
  };
}
