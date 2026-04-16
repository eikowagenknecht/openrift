import type { Printing } from "@openrift/shared";
import { sortCards } from "@openrift/shared";

import { useCards } from "@/hooks/use-cards";
import { useCopies } from "@/hooks/use-copies";

/** Copies of the same printing, stacked into one visual entry. */
export interface StackedEntry {
  printingId: string;
  printing: Printing;
  copyIds: string[];
}

interface UseStackedCopiesResult {
  stacks: StackedEntry[];
  totalCopies: number;
  isReady: boolean;
}

/**
 * Groups copies by printing ID into stacks, sorted by card ID.
 * @returns Sorted stacks, total copy count, and a readiness flag that lets
 * callers distinguish "still loading" from "loaded but empty" so the empty
 * state doesn't flash before the first fetch resolves.
 */
export function useStackedCopies(collectionId?: string): UseStackedCopiesResult {
  const { data: copies, isReady } = useCopies(collectionId);
  const { allPrintings } = useCards();

  const printingById = new Map<string, Printing>();
  for (const printing of allPrintings) {
    printingById.set(printing.id, printing);
  }

  const stacks: StackedEntry[] = [];
  const stackMap = new Map<string, StackedEntry>();
  for (const copy of copies) {
    const printing = printingById.get(copy.printingId);
    if (!printing) {
      continue;
    }
    const existing = stackMap.get(copy.printingId);
    if (existing) {
      existing.copyIds.push(copy.id);
    } else {
      const entry: StackedEntry = { printingId: copy.printingId, printing, copyIds: [copy.id] };
      stackMap.set(copy.printingId, entry);
      stacks.push(entry);
    }
  }

  const sortedCards = sortCards(
    stacks.map((stack) => stack.printing),
    "id",
  );
  const stackByPrintingId = new Map(stacks.map((stack) => [stack.printingId, stack]));
  const sortedStacks = sortedCards
    .map((card) => stackByPrintingId.get(card.id))
    .filter((stack): stack is StackedEntry => stack !== undefined);

  const totalCopies = sortedStacks.reduce((sum, stack) => sum + stack.copyIds.length, 0);

  return { stacks: sortedStacks, totalCopies, isReady };
}
