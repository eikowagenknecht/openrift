import type { CopyResponse, Printing } from "@openrift/shared";
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
 * Groups copies into per-printing stacks, sorted by card ID. When `collectionId`
 * is undefined (the "All Cards" / all-collections aggregate) the result is the
 * viewer's personal copies only — copies in a friend-group collection belong to
 * the group, not the viewer, so they must not stack into a personal count or
 * surface group-only cards as owned tiles. Scoped to a specific collection,
 * every copy in it counts (a group collection is viewed via its own id).
 * @returns Sorted stacks for the given scope.
 */
export function buildStacks(
  copies: readonly CopyResponse[],
  printingById: ReadonlyMap<string, Printing>,
  collectionId?: string,
): StackedEntry[] {
  const personalOnly = collectionId === undefined;
  const stacks: StackedEntry[] = [];
  const stackMap = new Map<string, StackedEntry>();
  for (const copy of copies) {
    if (personalOnly && copy.groupId !== null) {
      continue;
    }
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
  return sortedCards
    .map((card) => stackByPrintingId.get(card.id))
    .filter((stack): stack is StackedEntry => stack !== undefined);
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

  const sortedStacks = buildStacks(copies, printingById, collectionId);
  const totalCopies = sortedStacks.reduce((sum, stack) => sum + stack.copyIds.length, 0);

  return { stacks: sortedStacks, totalCopies, isReady };
}
