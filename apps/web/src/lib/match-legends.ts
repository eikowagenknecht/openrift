import type { Printing } from "@openrift/shared";
import { WellKnown, imageUrl, legendDisplayName } from "@openrift/shared";

import type { TrackedLegend } from "@/stores/match-tracker-store";

export interface LegendOption extends TrackedLegend {
  search: string;
}

/**
 * Printings arrive sorted by the reader's languages and canonical rank, so the
 * first one seen for a card is the one whose art to show.
 */
export function collectLegendOptions(printings: readonly Printing[]): LegendOption[] {
  const byCardId = new Map<string, LegendOption>();
  for (const printing of printings) {
    if (byCardId.has(printing.cardId)) {
      continue;
    }
    if (!printing.card.types.includes(WellKnown.cardType.LEGEND)) {
      continue;
    }
    const front = printing.images.find((image) => image.face === "front");
    const name = legendDisplayName(printing.card);
    byCardId.set(printing.cardId, {
      cardId: printing.cardId,
      name,
      domains: printing.card.domains,
      thumbnail: front ? imageUrl(front.imageId, "400w") : null,
      search: name.toLowerCase(),
    });
  }
  return [...byCardId.values()].toSorted((a, b) => a.name.localeCompare(b.name));
}

export function filterLegendOptions(options: LegendOption[], query: string): LegendOption[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return options;
  }
  return options.filter((option) => option.search.includes(needle));
}

export function toTrackedLegend(option: LegendOption): TrackedLegend {
  return {
    cardId: option.cardId,
    name: option.name,
    domains: option.domains,
    thumbnail: option.thumbnail,
  };
}
