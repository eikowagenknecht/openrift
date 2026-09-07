import type { EnumOrders, GroupByField } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";

import type { CardGroup, GroupInfo } from "@/lib/card-group-types";
import type { CardViewerItem } from "@/lib/card-viewer-types";
import type { EnumLabels } from "@/lib/enum-labels";

/** Shared across /cards, /collections and /promos so an axis reads the same everywhere. */
export const GROUP_BY_LABELS: Record<GroupByField, string> = {
  none: "None",
  set: "Set",
  type: "Type",
  superType: "Supertype",
  domain: "Domain",
  rarity: "Rarity",
  card: "Card",
  channel: "Distribution Channel",
  year: "Year",
  marker: "Marker",
  collection: "Collection",
};

export function groupByOptionsFor(
  values: readonly GroupByField[],
): { value: GroupByField; label: string }[] {
  return values.map((value) => ({ value, label: GROUP_BY_LABELS[value] }));
}

/** Marker and distribution channel live on individual printings; card pools a card's printings into one section. */
const PRINTINGS_ONLY_GROUP_BY: ReadonlySet<GroupByField> = new Set(["card", "channel", "marker"]);

export function isPrintingsOnlyGrouping(groupBy: GroupByField): boolean {
  return PRINTINGS_ONLY_GROUP_BY.has(groupBy);
}

const FIELD_GROUPINGS = ["type", "superType", "domain", "rarity"] as const;

export type FieldGrouping = (typeof FIELD_GROUPINGS)[number];

/** Callers must fall back to the default grouping for anything else; a foreign axis can arrive via a deep-linked URL. */
export function isFieldGrouping(groupBy: string): groupBy is FieldGrouping {
  return (FIELD_GROUPINGS as readonly string[]).includes(groupBy);
}

/** Synthetic bucket for cards with no super type — not an enum slug. */
const NO_SUPER_TYPE_KEY = "(None)";

interface FieldConfig {
  order: readonly string[];
  getKeysAndItems: (item: CardViewerItem) => { key: string; mapped: CardViewerItem }[];
  label?: (key: string) => string;
}

export function groupItemsByField(
  items: CardViewerItem[],
  groupBy: FieldGrouping,
  orders: Omit<EnumOrders, "finishes">,
  labels: EnumLabels,
): CardGroup[] {
  const config: Record<typeof groupBy, FieldConfig> = {
    type: {
      order: orders.cardTypes,
      getKeysAndItems: (item) => item.printing.card.types.map((key) => ({ key, mapped: item })),
      label: (key) => labels.cardTypes[key],
    },
    superType: {
      order: orders.superTypes,
      getKeysAndItems: (item) => {
        const supers = item.printing.card.superTypes;
        const keys = supers.length > 0 ? supers : [NO_SUPER_TYPE_KEY];
        return keys.map((key) => ({ key, mapped: item }));
      },
      label: (key) => (key === NO_SUPER_TYPE_KEY ? key : labels.superTypes[key]),
    },
    domain: {
      order: orders.domains,
      getKeysAndItems: (item) => {
        const doms = item.printing.card.domains;
        const keys = doms.length > 0 ? doms : [WellKnown.domain.COLORLESS];
        return keys.map((key) => ({ key, mapped: item }));
      },
      label: (key) => labels.domains[key],
    },
    rarity: {
      order: orders.rarities,
      getKeysAndItems: (item) => [{ key: item.printing.rarity, mapped: item }],
      label: (key) => labels.rarities[key],
    },
  };

  const { order, getKeysAndItems, label } = config[groupBy];

  const allKeys = new Set<string>();
  const buckets = new Map<string, CardViewerItem[]>();
  for (const item of items) {
    for (const { key, mapped } of getKeysAndItems(item)) {
      allKeys.add(key);
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.push(mapped);
      } else {
        buckets.set(key, [mapped]);
      }
    }
  }

  const orderedEntries: GroupInfo[] = [];
  for (const key of order) {
    if (allKeys.has(key)) {
      orderedEntries.push({ id: key, slug: "", name: label ? label(key) : key });
      allKeys.delete(key);
    }
  }
  for (const key of allKeys) {
    orderedEntries.push({ id: key, slug: "", name: label ? label(key) : key });
  }

  return orderedEntries.flatMap((entry) => {
    const bucket = buckets.get(entry.id);
    return bucket ? [{ group: entry, items: bucket }] : [];
  });
}
