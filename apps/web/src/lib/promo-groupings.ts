import type { GroupByField, Printing } from "@openrift/shared";

import type { CardGroup } from "@/components/cards/card-grid-types";

/**
 * The axes /promos offers, in the order it lists them: the page's own channel
 * tree first as the default, then the axes that separate promo printings from
 * each other (which card, which year, what it was handed out for), then the
 * card-level ones that mostly describe the underlying card.
 *
 * "channel" renders as this page's hierarchical tree (see promos-tree); every
 * other value is a shared axis from `buildGroups`, adapted into flat sections
 * by {@link toPromoSections}.
 *
 * Two shared axes are left out. "none" would render one unlabelled section, and
 * the page is built around section headers and a table of contents.
 * "collection" needs items that are physical copies, which promo printings are
 * not.
 *
 * Single source for the page's vocabulary — the group-by dropdown, the
 * persisted view prefs (see VIEW_SURFACE_CONFIGS) and asPromoGrouping all read
 * it, so they can't drift apart.
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

/**
 * Coerce an arbitrary URL value into a known promo grouping. Defaults to
 * "channel" so a deep link carrying an axis the page doesn't offer ("none" or
 * "collection") lands on the page's hierarchical default rather than rendering
 * one unlabelled section.
 *
 * @returns A valid PromoGrouping.
 */
export function asPromoGrouping(value: string | undefined): PromoGrouping {
  return value !== undefined && PROMO_GROUPING_SET.has(value)
    ? (value as PromoGrouping)
    : "channel";
}

/**
 * Adapt the shared grouping engine's output to the page's own section shape.
 * /promos renders its sections itself (non-virtualized, with a table of
 * contents and anchors) rather than through CardViewer, so it takes the groups
 * and drops the CardViewerItem wrapper the viewers need.
 *
 * @returns One PromoSection per group, in the same order.
 */
export function toPromoSections(groups: CardGroup[]): PromoSection[] {
  return groups.map((group) => ({
    id: group.group.id,
    label: group.group.name,
    printings: group.items.map((item) => item.printing),
  }));
}
