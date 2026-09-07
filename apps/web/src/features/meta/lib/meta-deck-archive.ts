import { REQUIRED_ZONES, zoneExpected } from "@openrift/shared/deck-zones";
import type { PublicDeckCardResponse } from "@openrift/shared/types/api/deck";
import type { DeckFormat, DeckZone, MetaListStatus } from "@openrift/shared/types/enums";
import { legendDisplayName } from "@openrift/shared/utils";
import { WellKnown } from "@openrift/shared/well-known";

export interface ArchivedDeckIdentity {
  cardId: string;
  name: string;
  slug: string;
  domains: string[];
}

/** Domains come from the card list; the meta contract's card refs don't carry them. */
export function archivedDeckIdentity(
  cards: readonly PublicDeckCardResponse[],
): ArchivedDeckIdentity | null {
  const named =
    cards.find((card) => card.zone === WellKnown.deckZone.LEGEND) ??
    cards.find((card) => card.zone === WellKnown.deckZone.CHAMPION);
  if (!named) {
    return null;
  }
  return {
    cardId: named.cardId,
    name: legendDisplayName({ name: named.cardName, types: named.cardTypes, tags: named.tags }),
    slug: named.cardSlug,
    domains: named.domains,
  };
}

export function unknownZoneCounts(
  cards: readonly PublicDeckCardResponse[],
  format: DeckFormat,
  listStatus: MetaListStatus,
): Map<DeckZone, number> {
  const counts = new Map<DeckZone, number>();
  if (listStatus !== "partial") {
    return counts;
  }
  for (const zone of REQUIRED_ZONES) {
    const expected = zoneExpected(zone, format);
    if (expected === undefined) {
      continue;
    }
    const held = cards
      .filter((card) => card.zone === zone)
      .reduce((sum, card) => sum + card.quantity, 0);
    if (held < expected) {
      counts.set(zone, expected - held);
    }
  }
  return counts;
}

const ZONE_NOUNS: Record<DeckZone, string> = {
  legend: "Legend",
  champion: "Chosen Champion",
  runes: "runes",
  battlefield: "battlefields",
  main: "main deck cards",
  sideboard: "sideboard cards",
  overflow: "spares",
};

function joinNouns(parts: readonly string[]): string {
  if (parts.length <= 1) {
    return parts[0] ?? "";
  }
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

export function describeIncompleteList(
  format: DeckFormat,
  unknown: ReadonlyMap<DeckZone, number>,
): string | null {
  const known: string[] = [];
  const missing: string[] = [];
  for (const zone of REQUIRED_ZONES) {
    const short = unknown.get(zone);
    const expected = zoneExpected(zone, format);
    if (short === undefined || expected === undefined) {
      continue;
    }
    const held = expected - short;
    if (held > 0) {
      known.push(`${held} of ${expected} ${ZONE_NOUNS[zone]}`);
    } else {
      missing.push(`the ${ZONE_NOUNS[zone]}`);
    }
  }
  if (known.length === 0 && missing.length === 0) {
    return null;
  }
  if (missing.length === 0) {
    return `${joinNouns(known)} are known.`;
  }
  const notKnown = joinNouns(missing);
  if (known.length === 0) {
    return `${notKnown[0]?.toUpperCase()}${notKnown.slice(1)} are not known.`;
  }
  return `${joinNouns(known)} are known; ${notKnown} are not.`;
}

/** Sources publishing cut buckets only know the top two ranks exactly; rank 3 gets no medal. */
export function medalRank(rank: number, rankIsTier: boolean): number | null {
  if (rank < 1 || rank > 3 || (rankIsTier && rank > 2)) {
    return null;
  }
  return rank;
}
