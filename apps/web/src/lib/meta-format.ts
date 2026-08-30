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
 * A player's match record as "W-L-D", or "W-L" when the source published no draw
 * count. Null when it published no record at all, which the display then leaves
 * out rather than printing zeroes it cannot vouch for.
 */
export function formatRecord(
  wins: number | null,
  losses: number | null,
  draws: number | null,
): string | null {
  if (wins === null || losses === null) {
    return null;
  }
  if (draws === null) {
    return `${wins}-${losses}`;
  }
  return `${wins}-${losses}-${draws}`;
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
