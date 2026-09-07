import type { Printing } from "@openrift/shared/types/catalog";
import type { RefObject } from "react";
import { toast } from "sonner";

import type { MatchStatus, MatchedEntry } from "@/features/collections/lib/import-matcher";
import type { ImportEntry } from "@/features/collections/lib/import-parsers";
import { summarizeMatchedEntries } from "@/features/collections/lib/import-summary";
import { parseListImport } from "@/features/lists/lib/list-import-parser";

export const STATUS_SORT_ORDER: Record<MatchStatus, number> = {
  unresolved: 0,
  "needs-review": 1,
  exact: 2,
};

export const IMPORT_BATCH_SIZE = 500;

export type ImportStep = "input" | "preview";

export interface ImportParseSetters {
  setRowCount: (rowCount: number) => void;
  setParseErrors: (errors: string[]) => void;
  setMatchedEntries: (entries: MatchedEntry[]) => void;
  setSkippedIndices: (indices: Set<number>) => void;
  setExpandedIndices: (indices: Set<number>) => void;
  setStep: (step: ImportStep) => void;
}

export function runImportParse(
  text: string,
  buildSorted: (entries: ImportEntry[]) => MatchedEntry[],
  setters: ImportParseSetters,
): void {
  const { entries, errors, rowCount } = parseListImport(text);
  setters.setRowCount(rowCount);
  setters.setParseErrors(errors);

  if (entries.length === 0) {
    return;
  }

  const sorted = buildSorted(entries);
  setters.setMatchedEntries(sorted);
  setters.setSkippedIndices(new Set());

  const nonExact = new Set<number>();
  for (const [index, entry] of sorted.entries()) {
    if (entry.status !== "exact") {
      nonExact.add(index);
    }
  }
  setters.setExpandedIndices(nonExact);

  setters.setStep("preview");
}

export async function handleImportFileUpload(
  event: React.ChangeEvent<HTMLInputElement>,
  fileRef: RefObject<HTMLInputElement | null>,
  setRawText: (text: string) => void,
  handleParse: (text: string) => void | Promise<void>,
): Promise<void> {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }
  let text: string;
  try {
    text = await file.text();
  } catch {
    toast.error("Could not read that file.");
    return;
  }
  setRawText(text);
  await handleParse(text);
  if (fileRef.current) {
    fileRef.current.value = "";
  }
}

export interface ImportEntryHandlers {
  handleResolve: (index: number, printing: Printing) => void;
  handleSkip: (index: number) => void;
  handleUnskip: (index: number) => void;
  handleToggleExpand: (index: number) => void;
}

export function createImportEntryHandlers(
  setMatchedEntries: (updater: (prev: MatchedEntry[]) => MatchedEntry[]) => void,
  setSkippedIndices: (updater: (prev: Set<number>) => Set<number>) => void,
  setExpandedIndices: (updater: (prev: Set<number>) => Set<number>) => void,
): ImportEntryHandlers {
  const handleResolve: ImportEntryHandlers["handleResolve"] = (index, printing) => {
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

  return { handleResolve, handleSkip, handleUnskip, handleToggleExpand };
}

export interface ImportSummary {
  importableEntries: MatchedEntry[];
  summary: ReturnType<typeof summarizeMatchedEntries>;
  skippedCount: number;
}

export function deriveImportSummary(
  matchedEntries: MatchedEntry[],
  skippedIndices: Set<number>,
): ImportSummary {
  const importableEntries = matchedEntries.filter(
    (entry, index) => entry.resolvedPrinting && !skippedIndices.has(index),
  );
  const summary = summarizeMatchedEntries(matchedEntries, skippedIndices);
  const skippedCount = skippedIndices.size;
  return { importableEntries, summary, skippedCount };
}
