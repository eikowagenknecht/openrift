import type { MetaDeckSubmissionKind } from "@/features/meta/lib/meta-submission-copy";

/**
 * `cut` matches `rankIsTier` on the row this came from: the archive's own
 * `tier` means an event's tier, and every route's search schema shares this namespace.
 */
export interface MetaSubmitSearch {
  player?: string;
  rank?: number;
  cut?: boolean;
  wins?: number;
  losses?: number;
  draws?: number;
  ask?: Exclude<MetaDeckSubmissionKind, "new_list">;
  deck?: string;
  legend?: string;
  legendId?: string;
}

const MAX_PLAYER_NAME = 80;

const MAX_LEGEND_NAME = 120;

const MAX_DECK_TOKEN = 64;

const MAX_CARD_ID = 64;

const ASKS = new Set<string>(["completion", "correction"]);

function count(value: number | null): number | undefined {
  return value ?? undefined;
}

function wholeCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function text(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= max ? value : undefined;
}

/** Only fields with values travel: `undefined` drops the param from the URL. */
export function metaSubmitSearchForPlayer(
  player: {
    playerName: string;
    rank: number;
    rankIsTier: boolean;
    wins: number | null;
    losses: number | null;
    draws: number | null;
    legend?: { name: string; cardId: string } | null;
    shareToken?: string | null;
  },
  ask?: Exclude<MetaDeckSubmissionKind, "new_list">,
): MetaSubmitSearch {
  return {
    player: player.playerName,
    rank: player.rank,
    cut: player.rankIsTier ? true : undefined,
    wins: count(player.wins),
    losses: count(player.losses),
    draws: count(player.draws),
    ask,
    // Only an ask that edits an existing list wants one: a brand-new list has
    // nothing to start from, and the token would just seed the box wrongly.
    deck: ask === undefined ? undefined : (player.shareToken ?? undefined),
    legend: player.legend?.name,
    legendId: player.legend?.cardId,
  };
}

/**
 * Nothing here is trusted: a value of the wrong type, a fractional or negative
 * count, or a name past the form's length limit is dropped.
 */
export function parseMetaSubmitSearch(search: Record<string, unknown>): MetaSubmitSearch {
  const ask = typeof search.ask === "string" && ASKS.has(search.ask) ? search.ask : undefined;
  return {
    player: text(search.player, MAX_PLAYER_NAME),
    rank: wholeCount(search.rank),
    cut: search.cut === true ? true : undefined,
    wins: wholeCount(search.wins),
    losses: wholeCount(search.losses),
    draws: wholeCount(search.draws),
    ask: ask as MetaSubmitSearch["ask"],
    deck: text(search.deck, MAX_DECK_TOKEN),
    legend: text(search.legend, MAX_LEGEND_NAME),
    legendId: text(search.legendId, MAX_CARD_ID),
  };
}
