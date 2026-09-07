import type { CopyResponse, Printing, SetOrderInfo } from "@openrift/shared";
import { sortCards } from "@openrift/shared";

import { useCards } from "@/hooks/use-cards";
import { useCopies } from "@/hooks/use-copies";

export interface StackedEntry {
  printingId: string;
  printing: Printing;
  copyIds: string[];
}

interface UseStackedCopiesResult {
  stacks: StackedEntry[];
  totalCopies: number;
  /** Covers every fetched copy, including ones excluded from `stacks`. */
  collectionIdByCopyId: ReadonlyMap<string, string>;
  isReady: boolean;
}

/**
 * When `collectionId` is undefined, excludes copies held in a friend-group
 * collection; those belong to the group, not the viewer's personal count.
 */
export function buildStacks(
  copies: readonly CopyResponse[],
  printingById: ReadonlyMap<string, Printing>,
  sets: readonly SetOrderInfo[],
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
    { sets },
  );
  const stackByPrintingId = new Map(stacks.map((stack) => [stack.printingId, stack]));
  return sortedCards
    .map((card) => stackByPrintingId.get(card.id))
    .filter((stack): stack is StackedEntry => stack !== undefined);
}

export function useStackedCopies(collectionId?: string): UseStackedCopiesResult {
  const { data: copies, isReady } = useCopies(collectionId);
  const { allPrintings, sets } = useCards();

  const printingById = new Map<string, Printing>();
  for (const printing of allPrintings) {
    printingById.set(printing.id, printing);
  }

  const sortedStacks = buildStacks(copies, printingById, sets, collectionId);
  const totalCopies = sortedStacks.reduce((sum, stack) => sum + stack.copyIds.length, 0);
  const collectionIdByCopyId = new Map(copies.map((copy) => [copy.id, copy.collectionId]));

  return { stacks: sortedStacks, totalCopies, collectionIdByCopyId, isReady };
}
