import type { MetaDeckSubmissionKind } from "@/lib/meta-submission-copy";

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
  /**
   * What the sender is being asked for. Absent means a list the archive has
   * none of, which is the form's own default and stays off the URL.
   */
  ask?: Exclude<MetaDeckSubmissionKind, "new_list">;
  /**
   * The archived deck to start from, by share token. The form seeds its paste
   * box with that list, so completing or correcting one means editing what the
   * archive holds rather than retyping it.
   */
  deck?: string;
  /** The legend the archive already has this entry on, named for the sender. */
  legend?: string;
  legendId?: string;
}

/** Matches the player-name bound the submission form and its contract enforce. */
const MAX_PLAYER_NAME = 80;

/** Generous, and only a display string: a card name past this is not one. */
const MAX_LEGEND_NAME = 120;

/** A deck share token is opaque; this only keeps a pasted essay out of the URL. */
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

/**
 * What a "+ Add", "Complete" or "Suggest a correction" link hands the submission
 * form, so someone filling a hole in the record types as little as possible.
 *
 * Only fields with values travel: `undefined` drops the param from the URL,
 * which keeps a link off a thin standings row short rather than littered with
 * empties.
 *
 * @param player The standings row the link sits on.
 * @param ask What the link is asking for, when it is not a brand-new list.
 */
export function metaSubmitSearchForPlayer(
  player: {
    playerName: string;
    rank: number;
    rankIsTier: boolean;
    wins: number | null;
    losses: number | null;
    draws: number | null;
    /** The archive's own legend for this entry, when it has resolved one. */
    legend?: { name: string; cardId: string } | null;
    /** The archived list, when the entry has one. */
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
 * The same shape read back off a URL anyone can type. Nothing here is trusted:
 * a value of the wrong type, a fractional or negative count, or a name past the
 * length the form accepts is dropped rather than carried into a field the
 * submitter cannot see is wrong.
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
