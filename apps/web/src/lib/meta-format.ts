import type { MetaEventTier, MetaListStatus } from "@openrift/shared";

/**
 * How much of a player's list the archive holds, in the words the archive uses
 * for it. `none` labels a standings-only entry, which is most of a real field;
 * `full` is what a reader already assumes, so nothing prints it.
 */
export const META_LIST_STATUS_LABELS: Record<MetaListStatus, string> = {
  full: "Full list",
  partial: "Partial list",
  none: "No list",
};

/**
 * The finishes that wear a medal instead of a printed rank. Every archive
 * surface that ranks a field reads this, so the podium is the same three places
 * on all of them.
 */
export const MEDAL_RANKS = 3;

/** How much an event counts for, in the words the archive shows readers. */
export const META_EVENT_TIER_LABELS: Record<MetaEventTier, string> = {
  premier: "Premier",
  competitive: "Competitive",
  store: "Store",
  casual: "Casual",
};

/**
 * Renders a standings row's finish (ADR-014).
 *
 * A source that publishes exact standings sets `rankIsTier = false` and the
 * rank prints as an ordinal ("1st", "4th", "8th"). A source that only publishes
 * cut buckets sets the flag: 1 and 2 are still the podium, and 3 up print as
 * "T4", "T8" — a bucket, not a placing.
 */
export function formatRank(rank: number, rankIsTier: boolean): string {
  if (!rankIsTier) {
    return formatOrdinal(rank);
  }
  const podium: Record<number, string> = { 1: "1st", 2: "2nd" };
  return podium[rank] ?? `T${rank}`;
}

/**
 * A player's match record, always as the full "14-1-0". A source that publishes
 * no draw column ran no draws to report, so the missing count prints as zero
 * rather than shortening the record: a column mixing "5-1" and "5-1-0" reads as
 * two different kinds of number.
 *
 * Null when the source published no record at all, which the display leaves out
 * rather than inventing a 0-0-0.
 */
export function formatRecord(
  wins: number | null,
  losses: number | null,
  draws: number | null,
): string | null {
  if (wins === null || losses === null) {
    return null;
  }
  return `${wins}-${losses}-${draws ?? 0}`;
}

/**
 * What an archive index's title bar says it is showing: the count on its own
 * while nothing is narrowed, and "N of M" once something is.
 *
 * Counts of what the archive holds, never a proportion. Grouping is pinned to
 * `en-US` because the page is server-rendered and a server on another default
 * would send "1.247" into a browser that renders "1,247".
 */
export function metaShownLabel(
  shown: number,
  total: number,
  noun: { singular: string; plural: string },
): string {
  const label = total === 1 ? noun.singular : noun.plural;
  if (shown === total) {
    return `${total.toLocaleString("en-US")} ${label}`;
  }
  return `${shown.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} ${label}`;
}

/**
 * "Nova", "Nova and Rell", "Nova, Rell and Sett" — every name printed, however
 * many there are.
 *
 * Built by hand rather than through `Intl.ListFormat` so the string is the same
 * for every reader, which is how the rest of the archive's rendered text works.
 */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) {
    return names[0] ?? "";
  }
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** A legend's name split into the two halves the archive prints separately. */
export interface LegendNameParts {
  /** The champion the legend is named for, or the whole name when it has none. */
  champion: string;
  /** The legend card's own title, null for a legend with no champion tag. */
  title: string | null;
}

/**
 * Undoes `legendDisplayName`'s join so the identity unit can weight the two
 * halves differently ("Lux · Lady of Luminosity"). The API sends the composed
 * form, and re-deriving it would need the card's tags, which the archive's
 * denormalized card refs do not carry.
 *
 * Splits on the first ", " only, which is where the composer put it.
 *
 * The split cannot tell a composed name from an untagged legend whose printed
 * name happens to carry a comma, and would read such a name as champion plus
 * title. Nothing in the catalogue is that card: every Legend is champion-tagged,
 * and the only four printed with a comma are the ", Starter" qualifiers, which
 * `legendDisplayName` trims before it ever composes. The behaviour is pinned by
 * a test so a change in either of those facts fails loudly.
 */
export function splitLegendName(name: string): LegendNameParts {
  const at = name.indexOf(", ");
  if (at === -1) {
    return { champion: name, title: null };
  }
  return { champion: name.slice(0, at), title: name.slice(at + 2) };
}

/**
 * A record's rank among the other records, as a standings table orders them:
 * most wins first, fewest losses breaking the tie. Null when the source
 * published no record, which sorts to the end.
 *
 * The two parts pack into one number because a column sorts on a single value.
 * No archived event runs a thousand rounds, so wins always outweigh losses.
 */
export function recordSortValue(wins: number | null, losses: number | null): number | null {
  if (wins === null) {
    return null;
  }
  return wins * 1000 - (losses ?? 0);
}

/**
 * The ranks the archive holds no row for: the holes inside the standings it
 * fetched, and the tail when the source reported a longer field than the last
 * row covers.
 *
 * A field published as cut tiers is exempt. Its ranks repeat and skip by
 * design ("1st, 2nd, T4, T4, T8..."), so every bucket boundary would read as a
 * hole. An event with no standings at all is exempt too: it is pending, not
 * incomplete.
 */
export function standingsGaps(
  players: readonly { rank: number; rankIsTier: boolean }[],
  reported: number | null,
): number[] {
  if (players.length === 0 || players.some((player) => player.rankIsTier)) {
    return [];
  }
  const held = new Set(players.map((player) => player.rank));
  const last = Math.max(reported ?? 0, ...held);
  const gaps: number[] = [];
  for (let rank = 1; rank <= last; rank++) {
    if (!held.has(rank)) {
      gaps.push(rank);
    }
  }
  return gaps;
}

/**
 * A sorted rank list as runs: "83, 118" for scattered holes, "91–128" for a
 * missing tail. Past `limit` runs the rest are counted rather than named, so a
 * barely-fetched event does not print a paragraph.
 */
export function formatRankRuns(ranks: readonly number[], limit = 6): string {
  const runs: string[] = [];
  let start: number | null = null;
  let end = 0;
  for (const rank of ranks) {
    if (start === null) {
      start = rank;
      end = rank;
      continue;
    }
    if (rank === end + 1) {
      end = rank;
      continue;
    }
    runs.push(start === end ? `${start}` : `${start}–${end}`);
    start = rank;
    end = rank;
  }
  if (start !== null) {
    runs.push(start === end ? `${start}` : `${start}–${end}`);
  }
  if (runs.length <= limit) {
    return runs.join(", ");
  }
  return `${runs.slice(0, limit).join(", ")} and ${runs.length - limit} more`;
}

/**
 * What an event row says it holds. An event whose results have not been fetched
 * yet holds nothing, and "0 players · 0 decks" reads as a broken event rather
 * than a pending one, so it says it is waiting instead.
 *
 * @param playerRowCount - Standings rows the archive holds for the event.
 * @param deckCount - Those rows with a decklist attached.
 * @returns The count fragments for the row's detail line.
 */
export function metaEventCounts(playerRowCount: number, deckCount: number): string[] {
  if (playerRowCount === 0) {
    return ["Results pending"];
  }
  return [
    `${playerRowCount} ${playerRowCount === 1 ? "player" : "players"}`,
    `${deckCount} ${deckCount === 1 ? "deck" : "decks"}`,
  ];
}

function formatOrdinal(value: number): string {
  const lastTwo = value % 100;
  if (lastTwo >= 11 && lastTwo <= 13) {
    return `${value}th`;
  }
  const suffixes: Record<number, string> = { 1: "st", 2: "nd", 3: "rd" };
  return `${value}${suffixes[value % 10] ?? "th"}`;
}
