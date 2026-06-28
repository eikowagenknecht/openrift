import type { ListKind, Printing } from "@openrift/shared";
import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { useCards } from "@/hooks/use-cards";
import { useCreateCollection } from "@/hooks/use-collections";
import { useAddCopies } from "@/hooks/use-copies";
import type { ImportableListKind } from "@/hooks/use-list-import-flow";
import { buildListImportPayload } from "@/hooks/use-list-import-flow";
import { useBulkAddListEntries, useLists } from "@/hooks/use-lists";
import type { MatchStatus, MatchedEntry } from "@/lib/import-matcher";
import { matchEntries } from "@/lib/import-matcher";
import { summarizeMatchedEntries } from "@/lib/import-summary";
import { parseListImport } from "@/lib/list-import-parser";
import { useDisplayStore } from "@/stores/display-store";

const STATUS_SORT_ORDER: Record<MatchStatus, number> = {
  unresolved: 0,
  "needs-review": 1,
  exact: 2,
};

const BATCH_SIZE = 500;

/** Prefix marking a target-select value as a list (vs a collection id or `__new__`). */
export const LIST_TARGET_PREFIX = "list:";

/** A list the importer can target, narrowed to the kinds that accept imported cards. */
export interface ImportableListOption {
  id: string;
  name: string;
  kind: ImportableListKind;
}

/**
 * Narrows the user's lists to those that can receive an import. Lists store
 * cards (`cardId`) or printings (`printingId`); copy-kind lists track specific
 * owned copies, which a CSV can't reference, so they're excluded.
 * @returns The importable lists as target options.
 */
export function toImportableListOptions(
  lists: readonly { id: string; name: string; kind: ListKind }[],
): ImportableListOption[] {
  return lists
    .filter((list) => list.kind === "card" || list.kind === "printing")
    .map((list) => ({ id: list.id, name: list.name, kind: list.kind as ImportableListKind }));
}

type ImportStep = "input" | "preview";

/**
 * Manages all state and handlers for the import flow: parsing, matching,
 * resolving needs-review entries, skipping, and batch-importing into a collection.
 * @returns Import flow state and action handlers.
 */
export function useImportFlow() {
  const { allPrintings } = useCards();
  const addCopies = useAddCopies();
  const createCollection = useCreateCollection();
  const bulkAddEntries = useBulkAddListEntries();
  const navigate = useNavigate();
  const preferredLanguages = useDisplayStore((state) => state.languages);

  const { data: lists } = useLists();
  const importableLists = toImportableListOptions(lists);

  const [step, setStep] = useState<ImportStep>("input");
  const [rawText, setRawText] = useState("");
  const [matchedEntries, setMatchedEntries] = useState<MatchedEntry[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [collectionId, setCollectionId] = useState("");
  const [newCollectionName, setNewCollectionName] = useState("");
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [skippedIndices, setSkippedIndices] = useState<Set<number>>(new Set());
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set());
  const [rowCount, setRowCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleParse = (text: string) => {
    const { entries, errors, rowCount: parsedRowCount } = parseListImport(text);
    setRowCount(parsedRowCount);
    setParseErrors(errors);

    if (entries.length === 0) {
      return;
    }

    const matched = matchEntries(entries, allPrintings, preferredLanguages[0]);
    const sorted = matched.toSorted((entryA, entryB) => {
      const statusDiff = STATUS_SORT_ORDER[entryA.status] - STATUS_SORT_ORDER[entryB.status];
      if (statusDiff !== 0) {
        return statusDiff;
      }
      return entryA.entry.sourceCode.localeCompare(entryB.entry.sourceCode);
    });
    setMatchedEntries(sorted);
    setSkippedIndices(new Set());

    // Auto-expand non-exact entries so the user sees details that need attention
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
    // Reset file input so the same file can be re-selected
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

  const importIntoList = async (listId: string) => {
    const list = importableLists.find((option) => option.id === listId);
    if (!list) {
      toast.error("Please select a target.");
      return;
    }

    setIsImporting(true);

    const payload = buildListImportPayload(importableEntries, list.kind);
    const batches: (typeof payload)[] = [];
    for (let offset = 0; offset < payload.length; offset += BATCH_SIZE) {
      batches.push(payload.slice(offset, offset + BATCH_SIZE));
    }
    const cardLabel = summary.totalCards === 1 ? "card" : "cards";

    const sendAllBatches = async () => {
      for (const batch of batches) {
        await bulkAddEntries.mutateAsync({ listId, entries: batch });
      }
    };

    try {
      await sendAllBatches();
      toast.success(`Added ${summary.totalCards} ${cardLabel} to ${list.name}.`);
      navigate({ to: "/collections/lists/$listId", params: { listId } });
    } catch {
      toast.error("Import failed. Some cards may have been added.");
      setIsImporting(false);
    }
  };

  const handleImport = async () => {
    if (collectionId.startsWith(LIST_TARGET_PREFIX)) {
      await importIntoList(collectionId.slice(LIST_TARGET_PREFIX.length));
      return;
    }

    let targetCollectionId = collectionId;

    // Create new collection if needed
    if (targetCollectionId === "__new__") {
      const trimmed = newCollectionName.trim();
      if (!trimmed) {
        toast.error("Please enter a collection name.");
        return;
      }
      setIsCreatingCollection(true);
      try {
        const result = await createCollection.mutateAsync({ name: trimmed });
        targetCollectionId = result.id;
      } catch {
        toast.error("Failed to create collection.");
        setIsCreatingCollection(false);
        return;
      }
      setIsCreatingCollection(false);
    }

    if (!targetCollectionId || targetCollectionId === "__new__") {
      toast.error("Please select a target collection.");
      return;
    }

    setIsImporting(true);

    // Build copies payload — expand quantities into individual entries
    const copies: { printingId: string; collectionId: string }[] = [];
    for (const entry of importableEntries) {
      for (let count = 0; count < entry.entry.quantity; count++) {
        copies.push({
          printingId: entry.resolvedPrinting?.id ?? "",
          collectionId: targetCollectionId,
        });
      }
    }

    // Batch in groups of 500
    const batches: (typeof copies)[] = [];
    for (let offset = 0; offset < copies.length; offset += BATCH_SIZE) {
      batches.push(copies.slice(offset, offset + BATCH_SIZE));
    }
    const copyLabel = summary.totalCards === 1 ? "copy" : "copies";

    const sendAllBatches = async () => {
      for (const batch of batches) {
        await addCopies.mutateAsync({ copies: batch });
      }
    };

    try {
      await sendAllBatches();
      toast.success(`Imported ${summary.totalCards} ${copyLabel}.`);
      navigate({
        to: "/collections/$collectionId",
        params: { collectionId: targetCollectionId },
      });
    } catch {
      toast.error("Import failed. Some cards may have been added.");
      setIsImporting(false);
    }
  };

  return {
    // State
    step,
    rawText,
    matchedEntries,
    parseErrors,
    collectionId,
    newCollectionName,
    importableLists,
    isImporting: isImporting || isCreatingCollection,
    skippedIndices,
    expandedIndices,
    rowCount,
    fileRef,
    allPrintings,

    // Derived
    readyCount: summary.readyCount,
    toVerifyCount: summary.toVerifyCount,
    needsAttentionCount: summary.needsAttentionCount,
    importableCount: summary.importableCount,
    skippedCount,
    totalCards: summary.totalCards,

    // Actions
    handleRawTextChange: setRawText,
    handleCollectionChange: setCollectionId,
    handleNewCollectionNameChange: setNewCollectionName,
    handleParse,
    handleFileUpload,
    handleResolve,
    handleSkip,
    handleUnskip,
    handleToggleExpand,
    handleImport,
    handleBack: () => setStep("input"),
  };
}
