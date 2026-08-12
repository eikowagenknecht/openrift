import type { EnumOrders, GroupByField } from "@openrift/shared";
import { orderSetsMainFirst } from "@openrift/shared";

import type { CardViewerItem } from "@/components/card-viewer-types";
import type { GroupInfo } from "@/components/cards/card-grid-types";
import type { EnumLabels } from "@/hooks/use-enums";
import { groupItemsByChannel } from "@/lib/group-by-channel";
import { groupItemsByCollection } from "@/lib/group-by-collection";
import { groupItemsByField, isFieldGrouping } from "@/lib/group-by-field";
import { groupItemsByMarker } from "@/lib/group-by-marker";
import { groupItemsByYear } from "@/lib/group-by-year";

/** A section of cards in a viewer: its header info plus the items it contains. */
export interface CardGroup {
  group: GroupInfo;
  items: CardViewerItem[];
}

/**
 * Groups items by set: main sets first, then supplemental ones (matching the
 * filter sidebar order), preserving the source order within each group. Sets
 * with no items are dropped.
 * @returns One CardGroup per non-empty set, main sets before supplemental.
 */
export function groupItemsBySet(items: CardViewerItem[], setOrder: GroupInfo[]): CardGroup[] {
  const bySet = Map.groupBy(items, (item) => item.printing.setId);
  // Stable sort keeps the source (release) order within each set type.
  const orderedSets = orderSetsMainFirst(setOrder);
  return orderedSets.flatMap((info) => {
    const setItems = bySet.get(info.id);
    return setItems ? [{ group: info, items: setItems }] : [];
  });
}

/**
 * Groups items for a card viewer by the chosen axis (set / field / channel /
 * year / marker / collection), applying the group direction. Shared by the grid
 * and table viewers; each then lays the groups out into its own virtual rows.
 * @returns The ordered card groups, or a single "_all" group when ungrouped.
 */
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
  if (groupBy === "channel") {
    return groupItemsByChannel(items, groupDir);
  }
  if (groupBy === "collection") {
    // Only /collections' copies view supplies a collection order. Anywhere else
    // (a deep-linked `?groupBy=collection` on a surface whose items are
    // printings) this axis has nothing to bucket by, so fall through to the
    // ungrouped single section rather than one bucket per missing id.
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
    // "set" — and, defensively, any axis this surface doesn't group by (a
    // foreign axis like /promos' "card" deep-linked onto /cards). Fall back
    // to the default set grouping instead of crashing the grid.
    groups = setOrder
      ? groupItemsBySet(items, setOrder)
      : [{ group: { id: "_all", slug: "", name: "" }, items }];
  }
  if (groupDir === "desc") {
    groups = groups.toReversed();
  }
  return groups;
}
