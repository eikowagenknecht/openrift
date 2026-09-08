/**
 * Allocation of a group's bulk-box contents against a member's wish demand.
 *
 * Each collection is allocated independently: a want fully covered by one box
 * still shows against another. Within one box, an entry never takes more than
 * its residual want, and a copy is never handed to two entries.
 */

/**
 * One wish entry, already expanded and netted by the matcher. Structurally the
 * demand-entry subset this allocation reads — the repo's richer entry passes
 * through unchanged.
 */
export interface BoxWantDemand {
  kind: "card" | "printing";
  cardId: string | null;
  printingId: string | null;
  buyQuantity: number;
  acceptablePrintingIds: ReadonlySet<string> | null;
}

export interface BoxAvailablePrinting {
  printingId: string;
  cardId: string;
  quantity: number;
}

/** Already stripped of ineligible copies. */
export interface BoxCollectionAvailability {
  collectionId: string;
  printings: readonly BoxAvailablePrinting[];
}

export interface BoxWantRow {
  collectionId: string;
  printingId: string;
  cardId: string;
  fulfillableQuantity: number;
}

function accepts(entry: BoxWantDemand, printingId: string, cardId: string): boolean {
  // Must apply the same printing gate as the match view applies to a supply copy.
  if (entry.acceptablePrintingIds !== null && !entry.acceptablePrintingIds.has(printingId)) {
    return false;
  }
  return entry.kind === "printing" ? entry.printingId === printingId : entry.cardId === cardId;
}

/**
 * Demand entries are consumed in build order, so a want split across several
 * lists spends the box in a stable sequence.
 */
export function allocateBoxWants(
  demand: readonly BoxWantDemand[],
  availableByCollection: readonly BoxCollectionAvailability[],
): BoxWantRow[] {
  const rows: BoxWantRow[] = [];
  for (const box of availableByCollection) {
    const remaining = new Map<string, { cardId: string; quantity: number }>();
    for (const printing of box.printings) {
      const slot = remaining.get(printing.printingId);
      if (slot) {
        slot.quantity += printing.quantity;
      } else {
        remaining.set(printing.printingId, {
          cardId: printing.cardId,
          quantity: printing.quantity,
        });
      }
    }
    const taken = new Map<string, number>();
    for (const entry of demand) {
      let want = entry.buyQuantity;
      if (want <= 0) {
        continue;
      }
      for (const [printingId, slot] of remaining) {
        if (want <= 0) {
          break;
        }
        if (slot.quantity <= 0 || !accepts(entry, printingId, slot.cardId)) {
          continue;
        }
        const take = Math.min(want, slot.quantity);
        slot.quantity -= take;
        want -= take;
        taken.set(printingId, (taken.get(printingId) ?? 0) + take);
      }
    }
    // Emit in the box's own printing order so the result is stable.
    for (const [printingId, slot] of remaining) {
      const quantity = taken.get(printingId) ?? 0;
      if (quantity > 0) {
        rows.push({
          collectionId: box.collectionId,
          printingId,
          cardId: slot.cardId,
          fulfillableQuantity: quantity,
        });
      }
    }
  }
  return rows;
}
