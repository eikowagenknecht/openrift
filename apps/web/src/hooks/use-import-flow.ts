import type { Printing } from "@openrift/shared";
import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { useCards } from "@/hooks/use-cards";
import { useCreateCollection } from "@/hooks/use-collections";
import { useAddCopies } from "@/hooks/use-copies";
import type { MatchStatus, MatchedEntry } from "@/lib/import-matcher";
import { matchEntries } from "@/lib/import-matcher";
import { parseImportData } from "@/lib/import-parsers";

const STATUS_SORT_ORDER: Record<MatchStatus, number> = {
  exact: 0,
  ambiguous: 1,
  fuzzy: 2,
  unresolved: 3,
};

type ImportStep = "input" | "preview";

/**
 * Manages all state and handlers for the import flow: parsing, matching,
 * resolving ambiguous entries, skipping, and batch-importing into a collection.
 * @returns Import flow state and action handlers.
 */
export function useImportFlow() {
  const { allPrintings } = useCards();
  const addCopies = useAddCopies();
  const createCollection = useCreateCollection();
  const navigate = useNavigate();

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
    const { entries, errors, rowCount: parsedRowCount } = parseImportData(text);
    setRowCount(parsedRowCount);
    setParseErrors(errors);

    if (entries.length === 0) {
      return;
    }

    const matched = matchEntries(entries, allPrintings);
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

  const readyEntries = matchedEntries.filter(
    (entry, index) => entry.resolvedPrinting && !skippedIndices.has(index),
  );
  const needsAttentionCount = matchedEntries.filter(
    (entry, index) => !entry.resolvedPrinting && !skippedIndices.has(index),
  ).length;
  const skippedCount = skippedIndices.size;
  const totalCards = readyEntries.reduce((sum, entry) => sum + entry.entry.quantity, 0);

  const handleImport = async () => {
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
    for (const entry of readyEntries) {
      for (let count = 0; count < entry.entry.quantity; count++) {
        copies.push({
          printingId: entry.resolvedPrinting?.id ?? "",
          collectionId: targetCollectionId,
        });
      }
    }

    // Batch in groups of 500
    const batchSize = 500;
    try {
      for (let offset = 0; offset < copies.length; offset += batchSize) {
        const batch = copies.slice(offset, offset + batchSize);
        await addCopies.mutateAsync({ copies: batch });
      }
      toast.success(`Imported ${totalCards} ${totalCards === 1 ? "copy" : "copies"}.`);
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
    isImporting: isImporting || isCreatingCollection,
    skippedIndices,
    expandedIndices,
    rowCount,
    fileRef,
    allPrintings,

    // Derived
    readyCount: readyEntries.length,
    needsAttentionCount,
    skippedCount,
    totalCards,

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
