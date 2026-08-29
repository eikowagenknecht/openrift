import { legendDisplayName } from "@openrift/shared";

import type { CardViewerItem } from "@/components/card-viewer-types";
import type { CardGroup } from "@/components/cards/card-grid-types";

/**
 * Group items by the card they print. One section per distinct card, sorted
 * alphabetically by card name (reversed when dir is desc). Within a section the
 * items keep their input order, so the user's sort still decides which printing
 * of a card comes first.
 *
 * Only meaningful in printings view, where a card's printings are separate
 * items — in cards view every section would hold exactly one tile (see
 * isPrintingsOnlyGrouping).
 *
 * @returns One section per card, keyed by card slug.
 */
export function groupItemsByCard(items: CardViewerItem[], dir: "asc" | "desc"): CardGroup[] {
  const buckets = new Map<string, { name: string; items: CardViewerItem[] }>();
  for (const item of items) {
    const { slug } = item.printing.card;
    const name = legendDisplayName(item.printing.card);
    const existing = buckets.get(slug);
    if (existing) {
      existing.items.push(item);
    } else {
      buckets.set(slug, { name, items: [item] });
    }
  }
  const sorted = [...buckets.entries()].toSorted(([, a], [, b]) => a.name.localeCompare(b.name));
  const ordered = dir === "desc" ? sorted.toReversed() : sorted;
  return ordered.map(([slug, bucket]) => ({
    // The card slug keys scroll and scrub targets; slug is blank on the group so
    // the header shows the name alone, as the other non-set axes do.
    group: { id: slug, slug: "", name: bucket.name },
    items: bucket.items,
  }));
}
