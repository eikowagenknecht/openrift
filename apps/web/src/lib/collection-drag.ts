import type { Printing } from "@openrift/shared";

import type { CardViewerItem } from "@/lib/card-viewer-types";
import type { StackedEntry } from "@/lib/stacked-entry";

interface DragSelectionArgs {
  mode: "browse" | "select";
  selected: Set<string>;
  items: CardViewerItem[];
  stackByItemId: Map<string, StackedEntry>;
  stacked: boolean;
}

/** Fan + count for a select-mode drag overlay. */
interface DragSelectionSummary {
  printings: Printing[];
  count: number;
}

/**
 * Builds the drag-overlay fan (first three unique printings whose copies are
 * selected) and counts how many tiles the selection spans.
 */
export function computeDragSelectionSummary({
  mode,
  selected,
  items,
  stackByItemId,
  stacked,
}: DragSelectionArgs): DragSelectionSummary {
  if (mode !== "select" || selected.size === 0) {
    return { printings: [], count: 0 };
  }
  const printings: Printing[] = [];
  const seen = new Set<string>();
  let count = 0;
  for (const item of items) {
    const stack = stackByItemId.get(item.id);
    if (!stack) {
      continue;
    }
    const hasSelectedCopy = stacked
      ? stack.copyIds.some((id) => selected.has(id))
      : selected.has(item.id);
    if (!hasSelectedCopy) {
      continue;
    }
    count++;
    if (printings.length < 3 && !seen.has(item.printing.id)) {
      seen.add(item.printing.id);
      printings.push(item.printing);
    }
  }
  return { printings, count };
}

export function dragSelectionNoun(view: "cards" | "printings" | "copies"): string {
  return view === "cards" ? "card" : view === "copies" ? "copy" : "printing";
}
