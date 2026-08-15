import type { Printing } from "@openrift/shared";
import { WellKnown, imageUrl, legendDisplayName } from "@openrift/shared";

import type { TrackedLegend } from "@/stores/match-tracker-store";

/** A legend offered by the seat picker, with everything the board needs baked in. */
export interface LegendOption extends TrackedLegend {
  /** Lowercased name, so filtering doesn't recase on every keystroke. */
  search: string;
}

/**
 * Collect the legends a player can sit behind, one entry per card.
 *
 * Printings arrive sorted by the reader's languages and canonical rank, so the
 * first printing seen for a card is the one whose art to show. The result is
 * denormalized into {@link TrackedLegend} shape on purpose: the board persists
 * its seats locally and must render without the catalog loaded.
 *
 * @returns Legend options sorted by display name.
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

/**
 * Narrow the legend list to those matching a search box.
 * @returns Every option when the query is blank, else the matching ones.
 */
export function filterLegendOptions(options: LegendOption[], query: string): LegendOption[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return options;
  }
  return options.filter((option) => option.search.includes(needle));
}

/**
 * Strip the search key so only what the board needs is persisted.
 * @returns The legend as stored on a seat.
 */
export function toTrackedLegend(option: LegendOption): TrackedLegend {
  return {
    cardId: option.cardId,
    name: option.name,
    domains: option.domains,
    thumbnail: option.thumbnail,
  };
}
