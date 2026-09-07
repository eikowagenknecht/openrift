import { orderSetsMainFirst } from "@openrift/shared/set-order";
import type { EnumOrders } from "@openrift/shared/types/enums";
import type { GroupByField } from "@openrift/shared/types/search";

import { groupItemsByCard } from "@/features/cards/lib/group-by-card";
import { groupItemsByChannel } from "@/features/cards/lib/group-by-channel";
import { groupItemsByCollection } from "@/features/cards/lib/group-by-collection";
import { groupItemsByField, isFieldGrouping } from "@/features/cards/lib/group-by-field";
import { groupItemsByMarker } from "@/features/cards/lib/group-by-marker";
import { groupItemsByYear } from "@/features/cards/lib/group-by-year";
import type { CardGroup, GroupInfo } from "@/lib/card-group-types";
import type { CardViewerItem } from "@/lib/card-viewer-types";
import type { EnumLabels } from "@/lib/enum-labels";

// Re-exported from its home next to GroupInfo, where the group-by-* modules can
// import it without cycling back through this dispatcher.
export type { CardGroup } from "@/lib/card-group-types";

// Main sets first, then supplemental ones (matching the filter sidebar
// order); sets with no items are dropped.
export function groupItemsBySet(items: CardViewerItem[], setOrder: GroupInfo[]): CardGroup[] {
  const bySet = Map.groupBy(items, (item) => item.printing.setId);
  // Stable sort keeps the source (release) order within each set type.
  const orderedSets = orderSetsMainFirst(setOrder);
  return orderedSets.flatMap((info) => {
    const setItems = bySet.get(info.id);
    return setItems ? [{ group: info, items: setItems }] : [];
  });
}

export function buildGroups(
  items: CardViewerItem[],
  groupBy: GroupByField,
  setOrder: GroupInfo[] | undefined,
  groupDir: "asc" | "desc",
  orders: EnumOrders,
  labels: EnumLabels,
  collectionOrder?: GroupInfo[],
): CardGroup[] {
  if (groupBy === "none") {
    return [{ group: { id: "_all", slug: "", name: "" }, items }];
  }
  if (groupBy === "card") {
    return groupItemsByCard(items, groupDir);
  }
  if (groupBy === "channel") {
    return groupItemsByChannel(items, groupDir);
  }
  if (groupBy === "collection") {
    // A deep-linked `?groupBy=collection` on a surface whose items are
    // printings has nothing to bucket by; fall back to the ungrouped section.
    if (!collectionOrder) {
      return [{ group: { id: "_all", slug: "", name: "" }, items }];
    }
    const collectionGroups = groupItemsByCollection(items, collectionOrder);
    return groupDir === "desc" ? collectionGroups.toReversed() : collectionGroups;
  }
  if (groupBy === "year") {
    return groupItemsByYear(items, groupDir);
  }
  if (groupBy === "marker") {
    return groupItemsByMarker(items, groupDir);
  }
  let groups: CardGroup[];
  if (isFieldGrouping(groupBy)) {
    groups = groupItemsByField(items, groupBy, orders, labels);
  } else {
    // Also covers an unknown axis deep-linked in the URL.
    groups = setOrder
      ? groupItemsBySet(items, setOrder)
      : [{ group: { id: "_all", slug: "", name: "" }, items }];
  }
  if (groupDir === "desc") {
    groups = groups.toReversed();
  }
  return groups;
}
