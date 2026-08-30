import { useCards } from "@/hooks/use-cards";
import { useMetaDeckCards } from "@/hooks/use-meta";
import { useOwnedCount } from "@/hooks/use-owned-count";
import type { MetaDeckOwnership } from "@/lib/meta-deck-collection";
import {
  decodeMetaDeckCardIndex,
  metaDeckOwnershipByDeck,
  ownedCountsByCardId,
} from "@/lib/meta-deck-collection";

/**
 * How much of each archived list the reader already holds, keyed by deck id.
 *
 * Undefined until the copies are in, so a browser that has not heard from the
 * collection yet shows no ownership rather than an empty one — the difference
 * between "you own none of this" and "we do not know yet".
 *
 * Reads the catalog and the live copies collection, so it belongs in a
 * client-only child: `useOwnedCount` has no server snapshot, and the catalog is
 * a payload the archive's own pages otherwise never pull.
 */
export function useMetaDeckOwnership(): Map<string, MetaDeckOwnership> | undefined {
  const { data: index } = useMetaDeckCards();
  const { printingsByCardId } = useCards();
  const { data: ownedByPrinting } = useOwnedCount(true);

  if (ownedByPrinting === undefined) {
    return undefined;
  }
  return metaDeckOwnershipByDeck(
    decodeMetaDeckCardIndex(index),
    ownedCountsByCardId(ownedByPrinting, printingsByCardId),
  );
}
