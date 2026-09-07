import type { GroupByField } from "@openrift/shared/types/search";

import type { CardGroup, GroupInfo } from "@/lib/card-group-types";
import type { CardViewerItem } from "@/lib/card-viewer-types";

const UNKNOWN_COLLECTION_KEY = "(Unknown collection)";

export function isCopiesOnlyGrouping(groupBy: GroupByField): boolean {
  return groupBy === "collection";
}

/** A copy whose collection isn't in `collectionOrder` is grouped into a trailing bucket. */
export function groupItemsByCollection(
  items: CardViewerItem[],
  collectionOrder: GroupInfo[],
): CardGroup[] {
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
