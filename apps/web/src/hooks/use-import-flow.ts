import type { ListKind } from "@openrift/shared/types/api/list";
import { useNavigate } from "@tanstack/react-router";
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
import { useCreateCollection } from "@/hooks/use-collections";
import { useAddCopies, useDisposeCopies } from "@/hooks/use-copies";
import type { ImportableListKind } from "@/hooks/use-list-import-flow";
import { buildListImportPayload } from "@/hooks/use-list-import-flow";
import { useBulkAddListEntries, useLists } from "@/hooks/use-lists";
import { useCopiesCollection } from "@/lib/copies-collection";
import type { MatchedEntry } from "@/lib/import-matcher";
import { matchEntries } from "@/lib/import-matcher";
import type { ImportCopyMetadata } from "@/lib/import-parsers";
import { copyIdsInCollection, LIST_TARGET_PREFIX } from "@/lib/import-replace";
import { useDisplayStore } from "@/stores/display-store";

export interface ImportableListOption {
  id: string;
  name: string;
  kind: ImportableListKind;
}

/**
 * Copy-kind lists track specific owned copies, which a CSV can't reference,
 * so they're excluded here.
 */
export function toImportableListOptions(
  lists: readonly { id: string; name: string; kind: ListKind }[],
): ImportableListOption[] {
  return lists
    .filter((list) => list.kind === "card" || list.kind === "printing")
    .map((list) => ({ id: list.id, name: list.name, kind: list.kind as ImportableListKind }));
}

export function useImportFlow() {
  const { allPrintings } = useCards();
  const addCopies = useAddCopies();
  const disposeCopies = useDisposeCopies();
  const copiesCollection = useCopiesCollection();
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
    runImportParse(
      text,
      (entries) => {
        const matched = matchEntries(entries, allPrintings, preferredLanguages[0]);
        return matched.toSorted((entryA, entryB) => {
          const statusDiff = STATUS_SORT_ORDER[entryA.status] - STATUS_SORT_ORDER[entryB.status];
          if (statusDiff !== 0) {
            return statusDiff;
          }
          return entryA.entry.sourceCode.localeCompare(entryB.entry.sourceCode);
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

  const importIntoList = async (listId: string) => {
    const list = importableLists.find((option) => option.id === listId);
    if (!list) {
      toast.error("Please select a target.");
      return;
    }

    setIsImporting(true);

    const payload = buildListImportPayload(importableEntries, list.kind);
    const batches: (typeof payload)[] = [];
    for (let offset = 0; offset < payload.length; offset += IMPORT_BATCH_SIZE) {
      batches.push(payload.slice(offset, offset + IMPORT_BATCH_SIZE));
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
      void navigate({ to: "/collections/lists/$listId", params: { listId } });
    } catch {
      // Deliberate second toast: batches before the failing one already
      // committed, so this says the import was left half-done.
      toast.error("Import failed. Some cards may have been added.");
      setIsImporting(false);
    }
  };

  // Lists and the create-new target are always additive; only an existing
  // collection with `replaceExisting` disposes its current copies first.
  const handleImport = async ({ replaceExisting = false } = {}) => {
    if (collectionId.startsWith(LIST_TARGET_PREFIX)) {
      await importIntoList(collectionId.slice(LIST_TARGET_PREFIX.length));
      return;
    }

    let targetCollectionId = collectionId;

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
        // The global mutation error toast reports the failure.
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

    // Disposal refuses copies reserved by a live trade, so a pinned card
    // fails the clear and nothing is imported.
    if (replaceExisting) {
      const existingCopyIds = copiesCollection
        ? copyIdsInCollection(copiesCollection.toArray, targetCollectionId)
        : [];
      if (existingCopyIds.length > 0) {
        try {
          await disposeCopies.mutateAsync({ copyIds: existingCopyIds });
        } catch {
          // Deliberate second toast: this says the collection is untouched.
          toast.error("Couldn't clear the collection, so nothing was imported.");
          setIsImporting(false);
          return;
        }
      }
    }

    const copies: ({ printingId: string; collectionId: string } & ImportCopyMetadata)[] = [];
    for (const entry of importableEntries) {
      for (let count = 0; count < entry.entry.quantity; count++) {
        copies.push({
          printingId: entry.resolvedPrinting?.id ?? "",
          collectionId: targetCollectionId,
          ...entry.entry.metadata,
        });
      }
    }

    const batches: (typeof copies)[] = [];
    for (let offset = 0; offset < copies.length; offset += IMPORT_BATCH_SIZE) {
      batches.push(copies.slice(offset, offset + IMPORT_BATCH_SIZE));
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
      void navigate({
        to: "/collections/$collectionId",
        params: { collectionId: targetCollectionId },
      });
    } catch {
      // Deliberate second toast: batches before the failing one already
      // committed, so this says the import was left half-done.
      toast.error("Import failed. Some cards may have been added.");
      setIsImporting(false);
    }
  };

  return {
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

    readyCount: summary.readyCount,
    toVerifyCount: summary.toVerifyCount,
    needsAttentionCount: summary.needsAttentionCount,
    importableCount: summary.importableCount,
    skippedCount,
    totalCards: summary.totalCards,

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
