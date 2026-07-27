import type { Printing } from "@openrift/shared";
import type { RefObject } from "react";

import type { MatchStatus, MatchedEntry } from "@/lib/import-matcher";
import type { ImportEntry } from "@/lib/import-parsers";
import { summarizeMatchedEntries } from "@/lib/import-summary";
import { parseListImport } from "@/lib/list-import-parser";

/** Shared sort priority for the preview list: unresolved rows first, exact matches last. */
export const STATUS_SORT_ORDER: Record<MatchStatus, number> = {
  unresolved: 0,
  "needs-review": 1,
  exact: 2,
};

/** Max entries sent per bulk-add/add-copies request. */
export const IMPORT_BATCH_SIZE = 500;

export type ImportStep = "input" | "preview";

/** State setters `runImportParse` needs to apply a parse result. */
export interface ImportParseSetters {
  setRowCount: (rowCount: number) => void;
  setParseErrors: (errors: string[]) => void;
  setMatchedEntries: (entries: MatchedEntry[]) => void;
  setSkippedIndices: (indices: Set<number>) => void;
  setExpandedIndices: (indices: Set<number>) => void;
  setStep: (step: ImportStep) => void;
}

/**
 * Runs the shared parse-and-advance sequence used by every import flow:
 * parse the raw text, record the row count and any parse errors, and bail
 * out on an empty parse. Otherwise hand the parsed entries to `buildSorted`
 * (catalog matching + the caller's sort/promotion rules), store the result,
 * clear skips, auto-expand non-exact rows so the user sees what needs
 * attention, and advance to the preview step.
 * @returns Nothing; all effects happen through `setters`.
 */
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

  // Auto-expand non-exact entries so the user sees details that need attention
  const nonExact = new Set<number>();
  for (let index = 0; index < sorted.length; index++) {
    if (sorted[index].status !== "exact") {
      nonExact.add(index);
    }
  }
  setters.setExpandedIndices(nonExact);

  setters.setStep("preview");
}

/**
 * Handles a file-input change for an import flow: reads the selected file as
 * text, feeds it through the caller's `handleParse`, and resets the input so
 * the same file can be re-selected. No-ops when the selection is cleared.
 * @returns A promise that resolves once the file has been read and parsed.
 */
export async function handleImportFileUpload(
  event: React.ChangeEvent<HTMLInputElement>,
  fileRef: RefObject<HTMLInputElement | null>,
  setRawText: (text: string) => void,
  handleParse: (text: string) => void,
): Promise<void> {
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
}

/** Per-row handlers shared by every import flow's preview step. */
export interface ImportEntryHandlers {
  handleResolve: (index: number, printing: Printing) => void;
  handleSkip: (index: number) => void;
  handleUnskip: (index: number) => void;
  handleToggleExpand: (index: number) => void;
}

/**
 * Builds the row-level handlers shared by every import flow's preview step:
 * resolving an ambiguous row to a printing, skipping/unskipping a row, and
 * toggling a row's expanded details.
 * @returns The shared handlers, closed over the given state setters.
 */
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

/** Rows ready to import, the match-status summary, and the skipped-row count. */
export interface ImportSummary {
  importableEntries: MatchedEntry[];
  summary: ReturnType<typeof summarizeMatchedEntries>;
  skippedCount: number;
}

/**
 * Derives the rows ready to import (resolved and not skipped), the
 * match-status summary, and the skipped-row count, shared by every import
 * flow's preview step.
 * @returns The importable entries, match summary, and skipped count.
 */
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
