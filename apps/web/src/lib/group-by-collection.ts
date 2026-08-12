import type { GroupByField } from "@openrift/shared";

import type { CardViewerItem } from "@/components/card-viewer-types";
import type { GroupInfo } from "@/components/cards/card-grid-types";

/** A section of cards in a viewer, mirroring `CardGroup` from card-groups. */
interface CollectionGroup {
  group: GroupInfo;
  items: CardViewerItem[];
}

/** Bucket for copies whose collection is missing from the order list. */
const UNKNOWN_COLLECTION_KEY = "(Unknown collection)";

/**
 * Whether `groupBy` requires copies view. Grouping by collection needs an item
 * that is one physical copy: in cards / printings view a tile aggregates every
 * copy of a printing, which in the "All cards" aggregate can span several
 * collections at once, so the tile has no single collection to bucket under.
 * The group-by dropdown offers this axis only where the items carry a
 * `collectionId`, and the surface normalizes the value away elsewhere.
 * @returns `true` for the copies-only axis (collection).
 */
export function isCopiesOnlyGrouping(groupBy: GroupByField): boolean {
  return groupBy === "collection";
}

/**
 * Groups copies by the collection holding them, in the caller's collection
 * order (the sidebar's, so the sections read top to bottom the same way).
 * Collections with no copies in the current grid are dropped, and a copy whose
 * collection isn't in `collectionOrder` (one just deleted or moved out of the
 * viewer's reach, say) collects into a trailing bucket rather than vanishing.
 *
 * @returns One group per non-empty collection, in `collectionOrder` order.
 */
export function groupItemsByCollection(
  items: CardViewerItem[],
  collectionOrder: GroupInfo[],
): CollectionGroup[] {
  const byCollection = Map.groupBy(items, (item) => item.collectionId ?? UNKNOWN_COLLECTION_KEY);
  const known = new Set(collectionOrder.map((info) => info.id));
  const groups = collectionOrder.flatMap((info) => {
    const collectionItems = byCollection.get(info.id);
    return collectionItems ? [{ group: info, items: collectionItems }] : [];
  });
  const orphans = [...byCollection]
    .filter(([id]) => !known.has(id))
    .flatMap(([, collectionItems]) => collectionItems);
  if (orphans.length === 0) {
    return groups;
  }
  return [
    ...groups,
    { group: { id: UNKNOWN_COLLECTION_KEY, slug: "", name: "Other" }, items: orphans },
  ];
}
