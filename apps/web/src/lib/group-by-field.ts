import type { EnumOrders, GroupByField } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";

import type { CardViewerItem } from "@/components/card-viewer-types";
import type { CardGroup, GroupInfo } from "@/components/cards/card-grid-types";
import type { EnumLabels } from "@/hooks/use-enums";

/**
 * The dropdown label for every group-by axis. Surfaces pick which axes they
 * offer and in what order, but they all name them from here, so an axis reads
 * the same on /cards, /collections and /promos.
 */
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

/**
 * Build group-by dropdown options for `values`, in the order given.
 * @returns One `{ value, label }` per axis.
 */
export function groupByOptionsFor(
  values: readonly GroupByField[],
): { value: GroupByField; label: string }[] {
  return values.map((value) => ({ value, label: GROUP_BY_LABELS[value] }));
}

/**
 * Grouping axes that only make sense in printings view. Marker and distribution
 * channel live on individual printings, so in cards view a card collapses to its
 * canonical base printing — which carries neither — and every card falls into a
 * single "Unmarked" / "(No distribution channel)" bucket. Card is the mirror
 * case: it pools a card's printings into one section, which in cards view is
 * always a section of exactly one tile. The cards-view group-by dropdown hides
 * these, and switching to cards resets the grouping.
 */
const PRINTINGS_ONLY_GROUP_BY: ReadonlySet<GroupByField> = new Set(["card", "channel", "marker"]);

/**
 * Whether `groupBy` requires printings view (card / marker / distribution
 * channel).
 * @returns `true` for printings-only axes.
 */
export function isPrintingsOnlyGrouping(groupBy: GroupByField): boolean {
  return PRINTINGS_ONLY_GROUP_BY.has(groupBy);
}

/** The axes `groupItemsByField` knows how to bucket. */
const FIELD_GROUPINGS = ["type", "superType", "domain", "rarity"] as const;

export type FieldGrouping = (typeof FIELD_GROUPINGS)[number];

/**
 * Whether `groupBy` is one of the field-config axes `groupItemsByField`
 * handles. Callers must fall back to the default grouping for anything else —
 * a foreign axis (like /promos' "card") can arrive via a deep-linked URL.
 * @returns `true` when `groupBy` is a field-grouping axis.
 */
export function isFieldGrouping(groupBy: string): groupBy is FieldGrouping {
  return (FIELD_GROUPINGS as readonly string[]).includes(groupBy);
}

/** Synthetic bucket for cards with no super type — not an enum slug. */
const NO_SUPER_TYPE_KEY = "(None)";

interface FieldConfig {
  order: readonly string[];
  getKeysAndItems: (item: CardViewerItem) => { key: string; mapped: CardViewerItem }[];
  /** Maps a bucket key to its display name. Omitted → the key is shown as-is. */
  label?: (key: string) => string;
}

/**
 * Group items by a card-level field (type, super type, domain) or the
 * printing-level rarity, for /cards' non-set grouping. Items with a
 * multi-valued field (super types, domains) fan out into one section per value;
 * cards missing the value collect into a synthetic bucket. Section headers use
 * the enum's display label, not its slug.
 *
 * @returns Ordered field sections, with order-array entries first and any
 *   unknown keys appended.
 */
export function groupItemsByField(
  items: CardViewerItem[],
  groupBy: FieldGrouping,
  orders: Omit<EnumOrders, "finishes">,
  labels: EnumLabels,
): CardGroup[] {
  const config: Record<typeof groupBy, FieldConfig> = {
    type: {
      order: orders.cardTypes,
      // Multi-type cards (ADR-037) fan out into one section per type,
      // matching the superType/domain behavior.
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
      // The synthetic "(None)" bucket (cards with no super type) is not an enum
      // slug, so it has no label entry — show it verbatim.
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

  // Build ordered entries including a catch-all for values not in the order array
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
  // Append any remaining keys not in the predefined order
  for (const key of allKeys) {
    orderedEntries.push({ id: key, slug: "", name: label ? label(key) : key });
  }

  return orderedEntries.flatMap((entry) => {
    const bucket = buckets.get(entry.id);
    return bucket ? [{ group: entry, items: bucket }] : [];
  });
}
