/**
 * Allocation of a group's bulk-box contents against a member's wish demand.
 *
 * A "bulk box" is a group-owned collection members take cards from freely, so
 * the question it answers is per box: *what in THIS box do I still want?* Each
 * collection is therefore allocated independently — a want fully covered by one
 * box still shows against another. Netting across boxes would answer a
 * different question ("what do I want overall"), which nobody standing in front
 * of one box can act on, and would make a box's own answer depend on the order
 * the boxes happen to be read in.
 *
 * Within one box the allocation is bounded on both sides: an entry never takes
 * more than its residual want, and a physical copy is never handed to two
 * entries. That second bound is what stops a card-kind and a printing-kind wish
 * for the same card double-counting one copy.
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
  /**
   * Card demand produced purely by a rule only accepts the printings the
   * rule's filters matched. `null` means any printing of the card satisfies
   * the want.
   */
  acceptablePrintingIds: ReadonlySet<string> | null;
}

/** One printing's takeable copies in a box. */
export interface BoxAvailablePrinting {
  printingId: string;
  cardId: string;
  quantity: number;
}

/** One box's takeable contents, already stripped of ineligible copies. */
export interface BoxCollectionAvailability {
  collectionId: string;
  printings: readonly BoxAvailablePrinting[];
}

/** One printing in one box the viewer's wish lists still want. */
export interface BoxWantRow {
  collectionId: string;
  printingId: string;
  cardId: string;
  fulfillableQuantity: number;
}

function accepts(entry: BoxWantDemand, printingId: string, cardId: string): boolean {
  // A rule-produced want only accepts the printings its filters matched, which
  // is the same gate the match view applies to a supply copy.
  if (entry.acceptablePrintingIds !== null && !entry.acceptablePrintingIds.has(printingId)) {
    return false;
  }
  return entry.kind === "printing" ? entry.printingId === printingId : entry.cardId === cardId;
}

/**
 * Allocates each box's contents against the viewer's wish demand.
 *
 * Demand entries are consumed in build order, the same order the matcher nets
 * promised trades in, so a want split across several lists spends the box in a
 * stable sequence. A card-kind entry draws on any accepted printing of its card
 * in the order the box lists them; that only decides how one total is split
 * across printings of the same card, never how much is fulfillable in total.
 */
export function allocateBoxWants(
  demand: readonly BoxWantDemand[],
  availableByCollection: readonly BoxCollectionAvailability[],
): BoxWantRow[] {
  const rows: BoxWantRow[] = [];
  for (const box of availableByCollection) {
    // Pooled per printing, so a box listing one printing twice still yields one
    // row with the combined quantity.
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
