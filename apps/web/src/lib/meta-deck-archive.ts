import type {
  DeckFormat,
  DeckZone,
  MetaListStatus,
  PublicDeckCardResponse,
} from "@openrift/shared";
import { legendDisplayName, REQUIRED_ZONES, WellKnown, zoneExpected } from "@openrift/shared";

/** The legend an archived deck is named by, in the parts the identity unit takes. */
export interface ArchivedDeckIdentity {
  cardId: string;
  /** Champion-led display name, e.g. "Volibear, Relentless Storm". */
  name: string;
  /** The card's slug, so the name links at its card page. */
  slug: string;
  domains: string[];
}

/**
 * The legend an archived deck's page is titled by, read off the deck's own
 * cards rather than the archive payload.
 *
 * The meta contract's card refs carry no domains, and the deck page needs the
 * runes; the enriched share payload already denormalizes the printed name, the
 * slug, the types, the tags and the domains for every card, so the whole
 * identity is here without asking the archive for it.
 *
 * Falls back to the Chosen Champion for a list whose Legend the source never
 * published — a partial list still deserves a name.
 *
 * @returns The identity, or null when neither zone holds a card.
 */
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

/**
 * Per zone, how many cards the source of a partial list never published.
 *
 * An archived list that stops at the main deck leaves its side zones empty, and
 * an empty zone on a read-only page reads as a zone the player left empty. The
 * shortfall against the format's own target is what the page renders as dashed
 * "Unknown" slots instead.
 *
 * Only the deck proper is counted: a sideboard target is a cap rather than a
 * goal, so a missing sideboard is not a hole in the record.
 *
 * @returns The shortfall per zone, empty for a full list.
 */
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

/**
 * What each zone's cards are called in the sentence naming them. Bare, so a
 * count clause reads "10 of 12 runes" and the missing list adds its own "the".
 */
const ZONE_NOUNS: Record<DeckZone, string> = {
  legend: "Legend",
  champion: "Chosen Champion",
  runes: "runes",
  battlefield: "battlefields",
  main: "main deck cards",
  sideboard: "sideboard cards",
  overflow: "spares",
};

/** "a", "a and b", "a, b and c". */
function joinNouns(parts: readonly string[]): string {
  if (parts.length <= 1) {
    return parts[0] ?? "";
  }
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/**
 * What exactly is missing from a partial list, as the sentence the incomplete
 * callout prints: "34 of 39 main deck cards are known; the battlefields and the
 * runes are not."
 *
 * Generated rather than written, because a partial list can stop anywhere. The
 * old fixed sentence claimed the main deck was whole and named the sideboard,
 * and {@link unknownZoneCounts} contradicts it on both counts.
 *
 * @returns The sentence, or null for a list with nothing missing.
 */
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

/**
 * The rank a finish wears a medal for, or null when it prints as text instead.
 *
 * Follows `formatRank`: a source publishing cut buckets only knows its top two
 * exactly, so third place in such a field is the "T4" bucket and no medal.
 *
 * @returns The medal's numeral, or null.
 */
export function medalRank(rank: number, rankIsTier: boolean): number | null {
  if (rank < 1 || rank > 3 || (rankIsTier && rank > 2)) {
    return null;
  }
  return rank;
}
