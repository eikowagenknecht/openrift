import type { CardViewerItem } from "@/components/card-viewer-types";
import type { CardGroup } from "@/components/cards/card-grid-types";

export const NO_CHANNEL_ID = "_no-channel";
export const NO_CHANNEL_LABEL = "(No distribution channel)";
const BREADCRUMB_SEPARATOR = " → ";

/**
 * Group items by distribution channel for /cards' Channel grouping.
 * Each item with N channels fans out into N sections; items with no channels
 * collect into a trailing "(No channel)" bucket that stays last regardless of
 * direction, mirroring promo-groupings' "Unmarked" / "Unknown year" pattern.
 * Section labels carry the ancestor breadcrumb (e.g. "Worlds 2025 → Welcome Set").
 *
 * @returns Ordered channel sections plus an optional trailing no-channel section.
 */
export function groupItemsByChannel(items: CardViewerItem[], dir: "asc" | "desc"): CardGroup[] {
  const buckets = new Map<string, { label: string; items: CardViewerItem[] }>();
  const noChannel: CardViewerItem[] = [];
  for (const item of items) {
    const channels = item.printing.distributionChannels;
    if (channels.length === 0) {
      noChannel.push(item);
      continue;
    }
    for (const pc of channels) {
      const existing = buckets.get(pc.channel.id);
      if (existing) {
        existing.items.push(item);
      } else {
        const label = [...pc.ancestorLabels, pc.channel.label].join(BREADCRUMB_SEPARATOR);
        buckets.set(pc.channel.id, { label, items: [item] });
      }
    }
  }
  const sorted = [...buckets.entries()].toSorted(([, a], [, b]) => a.label.localeCompare(b.label));
  const ordered = dir === "desc" ? sorted.toReversed() : sorted;
  const sections: CardGroup[] = ordered.map(([id, bucket]) => ({
    // slug is blank so the header shows only the breadcrumb label; the channel's
    // own slug would just duplicate the label it already ends with.
    group: { id, slug: "", name: bucket.label },
    items: bucket.items,
  }));
  if (noChannel.length > 0) {
    sections.push({
      group: { id: NO_CHANNEL_ID, slug: "", name: NO_CHANNEL_LABEL },
      items: noChannel,
    });
  }
  return sections;
}
