import { todayUtc } from "@openrift/shared/set-release";
import type {
  MetaEventTier,
  MetaListStatus,
  MetaPlayerOverlayField,
} from "@openrift/shared/types/enums";
import { META_PLAYER_OVERLAY_FIELDS } from "@openrift/shared/types/enums";

// The deck share image also uses these; they live in `shared` for both to import.
export { formatRank, formatRecord } from "@openrift/shared/meta-standings";

export const META_LIST_STATUS_LABELS: Record<MetaListStatus, string> = {
  full: "Full list",
  partial: "Partial list",
  none: "No list",
};

export const MEDAL_RANKS = 3;

export const META_EVENT_TIER_LABELS: Record<MetaEventTier, string> = {
  premier: "Premier",
  competitive: "Competitive",
  local: "Local",
};

/** Grouping is pinned to `en-US`: SSR would otherwise send a different locale's separator than the browser renders. */
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

/** Not `Intl.ListFormat`: this must render the same string for every reader regardless of locale. */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) {
    return names[0] ?? "";
  }
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

export interface LegendNameParts {
  champion: string;
  title: string | null;
}

/**
 * Assumes every Legend is champion-tagged: an untagged legend, or a printed
 * name with a natural comma, would misparse as champion plus title.
 */
export function splitLegendName(name: string): LegendNameParts {
  const at = name.indexOf(", ");
  if (at === -1) {
    return { champion: name, title: null };
  }
  return { champion: name.slice(0, at), title: name.slice(at + 2) };
}

/** Assumes no event runs 1000+ rounds, or wins would stop outweighing losses in the packed value. */
export function recordSortValue(wins: number | null, losses: number | null): number | null {
  if (wins === null) {
    return null;
  }
  return wins * 1000 - (losses ?? 0);
}

/**
 * Exempt: cut-tier fields (ranks repeat and skip by design) and events with
 * no standings yet (pending, not incomplete).
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

/** Runs past `limit` are counted, not named. */
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

export interface MetaCountedEvent {
  eventDate: string;
  playerCount: number | null;
  playerRowCount: number;
  deckCount: number;
}

export function metaEventEmptyStatus(event: MetaCountedEvent, today = todayUtc()): string | null {
  if (event.playerRowCount > 0 || event.deckCount > 0) {
    return null;
  }
  return event.eventDate > today ? "Not played yet" : "No results on file";
}

export function metaEventFieldSize(
  event: Pick<MetaCountedEvent, "playerCount" | "playerRowCount">,
): number | null {
  return event.playerCount ?? (event.playerRowCount === 0 ? null : event.playerRowCount);
}

export function metaEventCounts(event: MetaCountedEvent, today = todayUtc()): string[] {
  const size = metaEventFieldSize(event);
  const parts: string[] = [];
  if (size !== null) {
    parts.push(`${size.toLocaleString("en-US")} ${size === 1 ? "player" : "players"}`);
  }
  if (event.playerRowCount === 0) {
    parts.push(event.eventDate > today ? "Not played yet" : "No results on file");
  } else {
    parts.push(`${event.deckCount} ${event.deckCount === 1 ? "deck" : "decks"}`);
  }
  return parts;
}

const META_PLAYER_CLAIM_LABELS: Record<MetaPlayerOverlayField, string> = {
  playerName: "Name",
  rank: "Finish",
  rankIsTier: "Bracket",
  wins: "Wins",
  losses: "Losses",
  draws: "Draws",
  matchPoints: "Match points",
  opponentMatchWinPct: "OMW%",
  gameWinPct: "GW%",
  opponentGameWinPct: "OGW%",
  entryStatus: "Entry status",
  legendCardId: "Legend",
  championCardId: "Champion",
  cards: "Decklist",
  listStatus: "Decklist",
};

export interface MetaPlayerClaimChip {
  field: MetaPlayerOverlayField;
  label: string;
}

/** `cards` and `listStatus` always collapse into one chip; unknown fields are dropped, not printed raw. */
export function metaPlayerClaimChips(claimedFields: readonly string[]): MetaPlayerClaimChip[] {
  const fields = new Set<string>(claimedFields);
  if (fields.has("listStatus")) {
    fields.add("cards");
  }
  return META_PLAYER_OVERLAY_FIELDS.filter(
    (field) => field !== "listStatus" && fields.has(field),
  ).map((field) => ({ field, label: META_PLAYER_CLAIM_LABELS[field] }));
}
