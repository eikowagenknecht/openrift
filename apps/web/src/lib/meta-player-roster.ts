import type { AdminMetaPlayer, MetaCandidatePlayer, MetaCandidateSource } from "@openrift/shared";
import { META_PLAYER_ACCEPT_FIELDS } from "@openrift/shared/contracts/admin/meta";
import type { MetaPlayerAcceptField } from "@openrift/shared/contracts/admin/meta";

import { formatRank, formatRecord } from "@/lib/meta-format";

// The standings roster's data model (ADR-014, review screen tier two): one row
// per player, one column per linked source, each cell holding what that source
// says about that player beside the archived standings row. Kept out of the
// component so the grouping rules — which are the whole difficulty — can be
// tested without a DOM.

/**
 * The column user submissions land in. They hang off the live event rather than
 * any candidate event, so they belong to no source, but they are still one
 * player's claim about one deck and the roster is where a claim is reviewed.
 */
export const SUBMITTED_COLUMN_ID = "submitted";

/** One column of the roster: a linked source, or the submissions pseudo-column. */
export interface RosterColumn {
  /** The candidate event's id, or {@link SUBMITTED_COLUMN_ID}. */
  id: string;
  /** What the header prints: the provider, or "Submissions". */
  label: string;
  /** False for the submissions column, which has no candidate event behind it. */
  isSource: boolean;
}

/** One player's row: the archived standings row, if any, and what each column holds. */
export interface RosterRow {
  /**
   * Stable across renders: the live row's id, or the normalized player name.
   * The two carry different prefixes so an id that reads like a name cannot
   * fold two players into one row.
   */
  key: string;
  /** The name the row is headed with — the live row's, else the first source's. */
  playerName: string;
  /** The archived standings row this is about, or null when nothing is filed yet. */
  live: AdminMetaPlayer | null;
  /** Candidate rows by column id. A column missing the player has no entry. */
  cells: Map<string, MetaCandidatePlayer>;
}

/**
 * Folds a player name to the key two sources spelling it differently still share.
 * Case and inner whitespace only: a source that writes a different name entirely
 * is a different player until an admin links the two.
 *
 * @param name - The player name as a source or the archive spells it.
 * @returns The grouping key.
 */
export function normalizePlayerName(name: string): string {
  return name.trim().toLowerCase().replaceAll(/\s+/gu, " ");
}

/**
 * The roster's columns, in the order the detail response listed its sources
 * (provider order, so columns keep their places between visits).
 *
 * @param sources - Every candidate linked to the live event.
 * @param submittedPlayerCount - How many rows hang off the live event directly.
 * @returns One column per source, plus the submissions column when it has rows.
 */
export function buildRosterColumns(
  sources: MetaCandidateSource[],
  submittedPlayerCount: number,
): RosterColumn[] {
  const columns: RosterColumn[] = sources.map((source) => ({
    id: source.id,
    label: source.provider,
    isSource: true,
  }));
  if (submittedPlayerCount > 0) {
    columns.push({ id: SUBMITTED_COLUMN_ID, label: "Submissions", isSource: false });
  }
  return columns;
}

/**
 * How a row is ordered.
 *
 * @param row - The roster row.
 * @returns Its archived rank, else the best any source claims for it.
 */
function rowRank(row: RosterRow): number {
  if (row.live !== null) {
    return row.live.rank;
  }
  const ranks = [...row.cells.values()].map((player) => player.rank);
  return ranks.length > 0 ? Math.min(...ranks) : Number.MAX_SAFE_INTEGER;
}

/**
 * Groups the archived standings and every source's standings into one row per
 * player.
 *
 * Identity is the link first and the name second: a candidate that names a live
 * row belongs to that row however differently it spells the player, and only an
 * unlinked one falls back to matching by name. That ordering is what lets an
 * admin fix a misspelling by linking rather than by editing both sides.
 *
 * @param livePlayers - The archived standings under the live event.
 * @param sources - Every candidate linked to it, one column each.
 * @param submittedPlayers - Rows hanging off the live event directly.
 * @returns The rows, best finish first, then player name.
 */
export function buildRosterRows(
  livePlayers: AdminMetaPlayer[],
  sources: MetaCandidateSource[],
  submittedPlayers: MetaCandidatePlayer[],
): RosterRow[] {
  const rows = new Map<string, RosterRow>();
  /** Player name key -> row key, so an unlinked candidate finds its player's row. */
  const byName = new Map<string, string>();
  /** Live row id -> row key, so a linked candidate finds its player's row. */
  const byPlayerId = new Map<string, string>();

  for (const player of livePlayers) {
    const key = `live:${player.id}`;
    rows.set(key, { key, playerName: player.playerName, live: player, cells: new Map() });
    byPlayerId.set(player.id, key);
    const nameKey = normalizePlayerName(player.playerName);
    if (!byName.has(nameKey)) {
      byName.set(nameKey, key);
    }
  }

  const columns: { columnId: string; players: MetaCandidatePlayer[] }[] = sources.map((source) => ({
    columnId: source.id,
    players: source.players,
  }));
  columns.push({ columnId: SUBMITTED_COLUMN_ID, players: submittedPlayers });

  for (const column of columns) {
    for (const player of column.players) {
      const nameKey = normalizePlayerName(player.playerName);
      const linkedKey =
        player.metaEventPlayerId === null ? undefined : byPlayerId.get(player.metaEventPlayerId);
      const key = linkedKey ?? byName.get(nameKey) ?? `name:${nameKey}`;
      let row = rows.get(key);
      if (row === undefined) {
        row = { key, playerName: player.playerName, live: null, cells: new Map() };
        rows.set(key, row);
      }
      if (!byName.has(nameKey)) {
        byName.set(nameKey, key);
      }
      // Two rows from one source under one player is a source bug; keep the
      // first so the roster stays one cell per column and nothing disappears
      // silently — the second still shows in that source's own standings.
      if (!row.cells.has(column.columnId)) {
        row.cells.set(column.columnId, player);
      }
    }
  }

  return [...rows.values()].toSorted((a, b) => {
    const rankDelta = rowRank(a) - rowRank(b);
    if (rankDelta !== 0) {
      return rankDelta;
    }
    return a.playerName.localeCompare(b.playerName);
  });
}

/**
 * Counts the copies a candidate's list holds, which is what the cell shows
 * against the live row's `cardCount`.
 *
 * @param player - The candidate standings row.
 * @returns The total number of copies across every zone, and 0 for no list.
 */
export function candidateCardCount(player: MetaCandidatePlayer): number {
  return player.cards?.reduce((total, card) => total + card.quantity, 0) ?? 0;
}

/** The per-field accepts a roster cell offers, as the cell needs to render them. */
export interface RosterFieldComparison {
  field: MetaPlayerAcceptField;
  label: string;
  live: string;
  candidate: string;
  /** True when taking this source's value would change the archived row. */
  differs: boolean;
}

/** @returns The value as the comparison rows print it. */
function displayValue(value: string | number | boolean | null): string {
  if (value === null || value === "") {
    return "(none)";
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  return String(value);
}

/** How one field reads and what it compares, before the two sides are rendered. */
interface FieldSpec {
  label: string;
  live: string | number | boolean | null;
  candidate: string | number | boolean | null;
  /** What the row prints, when that differs from the compared value. */
  liveText?: string | null;
  candidateText?: string | null;
}

/**
 * Every scalar the per-field accept can write, live against one source, in the
 * contract's own order. The card list is deliberately absent: it moves whole,
 * through `acceptMetaDeckList`.
 *
 * `rank` and `rankIsTier` are separate accepts because the contract makes them
 * separate, but the rank row prints the two together ("T8" against "8th"): each
 * side is read with its own flag, so the comparison shows what the page would
 * actually say rather than two bare numbers that look identical.
 *
 * @param live - The archived standings row, or null while the player has none.
 * @param candidate - The source's version of the row.
 * @returns One comparison per acceptable field.
 */
export function compareRosterFields(
  live: AdminMetaPlayer | null,
  candidate: MetaCandidatePlayer,
): RosterFieldComparison[] {
  const specs: Record<MetaPlayerAcceptField, FieldSpec> = {
    playerName: {
      label: "Player",
      live: live?.playerName ?? null,
      candidate: candidate.playerName,
    },
    rank: {
      label: "Finish",
      live: live?.rank ?? null,
      candidate: candidate.rank,
      liveText: live === null ? null : formatRank(live.rank, live.rankIsTier),
      candidateText: formatRank(candidate.rank, candidate.rankIsTier),
    },
    rankIsTier: {
      label: "Bracket only",
      live: live?.rankIsTier ?? null,
      candidate: candidate.rankIsTier,
    },
    wins: { label: "Wins", live: live?.wins ?? null, candidate: candidate.wins },
    losses: { label: "Losses", live: live?.losses ?? null, candidate: candidate.losses },
    draws: { label: "Draws", live: live?.draws ?? null, candidate: candidate.draws },
    legend: {
      label: "Legend",
      live: live?.legendCardId ?? null,
      candidate: candidate.legendCardId,
      liveText: live?.legendName ?? null,
      candidateText: candidate.legendName,
    },
    champion: {
      label: "Champion",
      live: live?.championCardId ?? null,
      candidate: candidate.championCardId,
      liveText: live?.championName ?? null,
      candidateText: candidate.championName,
    },
  };

  return META_PLAYER_ACCEPT_FIELDS.map((field) => {
    const spec = specs[field];
    return {
      field,
      label: spec.label,
      live: displayValue(spec.liveText === undefined ? spec.live : spec.liveText),
      candidate: displayValue(
        spec.candidateText === undefined ? spec.candidate : spec.candidateText,
      ),
      differs: live !== null && spec.live !== spec.candidate,
    };
  });
}

/**
 * A standings row's record as the roster cells print it.
 *
 * @param row - Anything carrying the three counts.
 * @returns "5-1-2", or null when the source published no record.
 */
export function rosterRecord(row: {
  wins: number | null;
  losses: number | null;
  draws: number | null;
}): string | null {
  return formatRecord(row.wins, row.losses, row.draws);
}

/** The card-level delta a list diff renders, in the shape the API's diff uses. */
export type RosterListDelta = NonNullable<MetaCandidatePlayer["diff"]>["cards"];

/**
 * The card delta to render for one candidate row. A linked row has the server's
 * diff against the archived list; an unlinked one has nothing to diff against,
 * so its whole list reads as additions — which is exactly what taking it would
 * write. A standings-only row carries no list and so no delta.
 *
 * @param player - The candidate standings row.
 * @returns The added / removed / changed rows to render.
 */
export function rosterListDelta(player: MetaCandidatePlayer): RosterListDelta {
  if (player.diff !== null) {
    return player.diff.cards;
  }
  return {
    added: (player.cards ?? []).map((card) => ({
      cardId: card.cardId ?? card.name,
      zone: card.zone,
      quantity: card.quantity,
      name: card.name,
    })),
    removed: [],
    changed: [],
  };
}

/**
 * Whether a delta has anything in it. An in-sync linked row produces an empty
 * one, and the expanded row says so rather than showing three empty headings.
 *
 * @param delta - The delta to check.
 * @returns True when at least one card row would render.
 */
export function hasListDelta(delta: RosterListDelta): boolean {
  return delta.added.length > 0 || delta.removed.length > 0 || delta.changed.length > 0;
}

/**
 * Why this candidate row cannot be filed yet, if anything.
 *
 * An unmatched card name blocks the accept outright: a decklist the archive
 * cannot resolve is not a decklist. An unmatched *legend* on a standings-only
 * row does not, because the archive still knows who played and how they
 * finished, but it needs the admin to say so rather than letting the row land
 * with a legend nothing can link to.
 *
 * @param player - The candidate standings row.
 * @returns The blocking reason, or null when it is ready.
 */
export function rosterAcceptBlockedReason(player: MetaCandidatePlayer): string | null {
  const count = player.unresolvedNames.length;
  if (count > 0) {
    return `${count} card ${count === 1 ? "name" : "names"} still unmatched.`;
  }
  return null;
}

/**
 * Whether filing this row needs the admin to wave through a legend the catalog
 * could not place.
 *
 * @param player - The candidate standings row.
 * @returns True when the source named a legend and nothing matched it.
 */
export function needsUnresolvedLegendConfirm(player: MetaCandidatePlayer): boolean {
  return player.legendName !== null && player.legendCardId === null;
}
