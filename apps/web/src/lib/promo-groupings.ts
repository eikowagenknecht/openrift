import type { GroupByField, Printing } from "@openrift/shared";

import type { CardGroup } from "@/lib/card-group-types";

/**
 * Excludes the shared "none" and "collection" axes: /promos always renders
 * section headers and promo printings aren't physical copies.
 */
export const PROMO_GROUPINGS = [
  "channel",
  "card",
  "year",
  "marker",
  "set",
  "type",
  "superType",
  "domain",
  "rarity",
] as const satisfies readonly GroupByField[];

export type PromoGrouping = (typeof PROMO_GROUPINGS)[number];

export interface PromoSection {
  id: string;
  label: string;
  printings: Printing[];
}

const PROMO_GROUPING_SET: ReadonlySet<string> = new Set<string>(PROMO_GROUPINGS);

export function asPromoGrouping(value: string | undefined): PromoGrouping {
  return value !== undefined && PROMO_GROUPING_SET.has(value)
    ? (value as PromoGrouping)
    : "channel";
}

export function toPromoSections(groups: CardGroup[]): PromoSection[] {
  return groups.map((group) => ({
    id: group.group.id,
    label: group.group.name,
    printings: group.items.map((item) => item.printing),
  }));
}
