import type { MetaEventPlayer } from "@openrift/shared";

/**
 * The standings row an event page opened the submission form from, as its link
 * carries it. `cut` says the finish is a cut bucket rather than an exact
 * placing, matching `rankIsTier` on the row it came from — the archive's `tier`
 * already means an event's own tier, and every route's search schema shares one
 * namespace here.
 *
 * Every field is optional: a source that published no records leaves the three
 * counts out, and the form shows them blank rather than inventing a 0-0-0.
 */
export interface MetaSubmitSearch {
  player?: string;
  rank?: number;
  cut?: boolean;
  wins?: number;
  losses?: number;
  draws?: number;
}

/** Matches the player-name bound the submission form and its contract enforce. */
const MAX_PLAYER_NAME = 80;

function count(value: number | null): number | undefined {
  return value ?? undefined;
}

function wholeCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

/**
 * What a "+ Add" or "Complete" link hands the submission form, so someone
 * filling a hole in the record types the decklist and nothing else.
 *
 * Only fields with values travel: `undefined` drops the param from the URL,
 * which keeps a link off a thin standings row short rather than littered with
 * empties.
 */
export function metaSubmitSearchForPlayer(
  player: Pick<MetaEventPlayer, "playerName" | "rank" | "rankIsTier" | "wins" | "losses" | "draws">,
): MetaSubmitSearch {
  return {
    player: player.playerName,
    rank: player.rank,
    cut: player.rankIsTier ? true : undefined,
    wins: count(player.wins),
    losses: count(player.losses),
    draws: count(player.draws),
  };
}

/**
 * The same shape read back off a URL anyone can type. Nothing here is trusted:
 * a value of the wrong type, a fractional or negative count, or a name past the
 * length the form accepts is dropped rather than carried into a field the
 * submitter cannot see is wrong.
 */
export function parseMetaSubmitSearch(search: Record<string, unknown>): MetaSubmitSearch {
  return {
    player:
      typeof search.player === "string" && search.player.length <= MAX_PLAYER_NAME
        ? search.player
        : undefined,
    rank: wholeCount(search.rank),
    cut: search.cut === true ? true : undefined,
    wins: wholeCount(search.wins),
    losses: wholeCount(search.losses),
    draws: wholeCount(search.draws),
  };
}
