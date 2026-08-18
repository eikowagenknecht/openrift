import type { AdminMetaDeck, MetaCandidateDeck, MetaCandidateSource } from "@openrift/shared";

// The deck roster's data model (ADR-014, review screen tier two): one row per
// pilot, one column per linked source, each cell holding what that source says
// about that pilot beside the archived deck. Kept out of the component so the
// grouping rules — which are the whole difficulty — can be tested without a DOM.

/**
 * The column user submissions land in. They hang off the live event rather than
 * any candidate event, so they belong to no source, but they are still one
 * pilot's claim about one deck and the roster is where a claim is reviewed.
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

/** One pilot's row: the archived deck, if any, and what each column holds. */
export interface RosterRow {
  /** Stable across renders: the live deck's id, or the normalized pilot name. */
  key: string;
  /** The name the row is headed with — the live deck's, else the first source's. */
  playerName: string;
  /** The archived deck this row is about, or null when nothing is archived yet. */
  live: AdminMetaDeck | null;
  /** Candidate decks by column id. A column missing the pilot has no entry. */
  cells: Map<string, MetaCandidateDeck>;
}

/**
 * Folds a pilot name to the key two sources spelling it differently still share.
 * Case and inner whitespace only: a source that writes a different name entirely
 * is a different pilot until an admin links the two.
 *
 * @param name - The pilot name as a source or the archive spells it.
 * @returns The grouping key.
 */
export function normalizePilotName(name: string): string {
  return name.trim().toLowerCase().replaceAll(/\s+/gu, " ");
}

/**
 * The roster's columns, in the order the detail response listed its sources
 * (provider order, so columns keep their places between visits).
 *
 * @param sources - Every candidate linked to the live event.
 * @param submittedDeckCount - How many decks hang off the live event directly.
 * @returns One column per source, plus the submissions column when it has decks.
 */
export function buildRosterColumns(
  sources: MetaCandidateSource[],
  submittedDeckCount: number,
): RosterColumn[] {
  const columns: RosterColumn[] = sources.map((source) => ({
    id: source.id,
    label: source.provider,
    isSource: true,
  }));
  if (submittedDeckCount > 0) {
    columns.push({ id: SUBMITTED_COLUMN_ID, label: "Submissions", isSource: false });
  }
  return columns;
}

/**
 * How a row is ordered.
 *
 * @param row - The roster row.
 * @returns Its archived finish tier, else the best any source claims for it.
 */
function rowFinish(row: RosterRow): number {
  if (row.live !== null) {
    return row.live.finishTier;
  }
  const tiers = [...row.cells.values()].map((deck) => deck.finishTier);
  return tiers.length > 0 ? Math.min(...tiers) : Number.MAX_SAFE_INTEGER;
}

/**
 * Groups the archived decks and every source's decks into one row per pilot.
 *
 * Identity is the link first and the name second: a candidate that names a live
 * deck belongs to that deck's row however differently it spells the pilot, and
 * only an unlinked one falls back to matching by name. That ordering is what
 * lets an admin fix a misspelling by linking rather than by editing both sides.
 *
 * @param liveDecks - The archived decks under the live event.
 * @param sources - Every candidate linked to it, one column each.
 * @param submittedDecks - Decks hanging off the live event directly.
 * @returns The rows, best finish first, then pilot name.
 */
export function buildRosterRows(
  liveDecks: AdminMetaDeck[],
  sources: MetaCandidateSource[],
  submittedDecks: MetaCandidateDeck[],
): RosterRow[] {
  const rows = new Map<string, RosterRow>();
  /** Pilot name key -> row key, so an unlinked candidate finds its pilot's row. */
  const byName = new Map<string, string>();
  /** Live deck id -> row key, so a linked candidate finds its deck's row. */
  const byDeckId = new Map<string, string>();

  for (const deck of liveDecks) {
    const key = `deck:${deck.deckId}`;
    rows.set(key, { key, playerName: deck.playerName, live: deck, cells: new Map() });
    byDeckId.set(deck.deckId, key);
    const nameKey = normalizePilotName(deck.playerName);
    if (!byName.has(nameKey)) {
      byName.set(nameKey, key);
    }
  }

  const columns: { columnId: string; decks: MetaCandidateDeck[] }[] = sources.map((source) => ({
    columnId: source.id,
    decks: source.decks,
  }));
  columns.push({ columnId: SUBMITTED_COLUMN_ID, decks: submittedDecks });

  for (const column of columns) {
    for (const deck of column.decks) {
      const nameKey = normalizePilotName(deck.playerName);
      const linkedKey = deck.deckId === null ? undefined : byDeckId.get(deck.deckId);
      const key = linkedKey ?? byName.get(nameKey) ?? `pilot:${nameKey}`;
      let row = rows.get(key);
      if (row === undefined) {
        row = { key, playerName: deck.playerName, live: null, cells: new Map() };
        rows.set(key, row);
      }
      if (!byName.has(nameKey)) {
        byName.set(nameKey, key);
      }
      // Two decks from one source under one pilot is a source bug; keep the
      // first so the roster stays one cell per column and nothing disappears
      // silently — the second still shows in that source's own deck list.
      if (!row.cells.has(column.columnId)) {
        row.cells.set(column.columnId, deck);
      }
    }
  }

  return [...rows.values()].toSorted((a, b) => {
    const finishDelta = rowFinish(a) - rowFinish(b);
    if (finishDelta !== 0) {
      return finishDelta;
    }
    return a.playerName.localeCompare(b.playerName);
  });
}

/**
 * Counts the copies a candidate's list holds, which is what the cell shows
 * against the live deck's `cardCount`.
 *
 * @param deck - The candidate deck.
 * @returns The total number of copies across every zone.
 */
export function candidateCardCount(deck: MetaCandidateDeck): number {
  return deck.cards.reduce((total, card) => total + card.quantity, 0);
}

/** The per-field accepts a roster cell offers, as the cell needs to render them. */
export interface RosterFieldComparison {
  field: "playerName" | "finishTier" | "record" | "listStatus";
  label: string;
  live: string;
  candidate: string;
  /** True when taking this source's value would change the archived deck. */
  differs: boolean;
}

/** @returns The value as the comparison rows print it. */
function displayValue(value: string | number | null): string {
  if (value === null || value === "") {
    return "—";
  }
  return String(value);
}

/**
 * The four scalar fields the deck-level accept can write, live against one
 * source. The card list is deliberately absent: it moves whole, through
 * `acceptMetaDeckList`.
 *
 * @param live - The archived deck, or null while the pilot has none.
 * @param candidate - The source's version of the deck.
 * @returns One comparison per acceptable field.
 */
export function compareRosterFields(
  live: AdminMetaDeck | null,
  candidate: MetaCandidateDeck,
): RosterFieldComparison[] {
  return [
    {
      field: "playerName" as const,
      label: "Player",
      liveValue: live?.playerName ?? null,
      candidateValue: candidate.playerName,
    },
    {
      field: "finishTier" as const,
      label: "Finish",
      liveValue: live?.finishTier ?? null,
      candidateValue: candidate.finishTier,
    },
    {
      field: "record" as const,
      label: "Record",
      liveValue: live?.record ?? null,
      candidateValue: candidate.record,
    },
    {
      field: "listStatus" as const,
      label: "List status",
      liveValue: live?.listStatus ?? null,
      candidateValue: candidate.listStatus,
    },
  ].map((row) => ({
    field: row.field,
    label: row.label,
    live: displayValue(row.liveValue),
    candidate: displayValue(row.candidateValue),
    differs: live !== null && row.liveValue !== row.candidateValue,
  }));
}

/** The card-level delta a list diff renders, in the shape the API's diff uses. */
export type RosterListDelta = NonNullable<MetaCandidateDeck["diff"]>["cards"];

/**
 * The card delta to render for one candidate deck. A linked deck has the
 * server's diff against the archived list; an unlinked one has nothing to diff
 * against, so its whole list reads as additions — which is exactly what taking
 * it would write.
 *
 * @param deck - The candidate deck.
 * @returns The added / removed / changed rows to render.
 */
export function rosterListDelta(deck: MetaCandidateDeck): RosterListDelta {
  if (deck.diff !== null) {
    return deck.diff.cards;
  }
  return {
    added: deck.cards.map((card) => ({
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
 * Whether a delta has anything in it. An in-sync linked deck produces an empty
 * one, and the expanded row says so rather than showing three empty headings.
 *
 * @param delta - The delta to check.
 * @returns True when at least one card row would render.
 */
export function hasListDelta(delta: RosterListDelta): boolean {
  return delta.added.length > 0 || delta.removed.length > 0 || delta.changed.length > 0;
}

/**
 * Why this candidate deck cannot be archived yet, if anything.
 *
 * @param deck - The candidate deck.
 * @returns The blocking reason, or null when it is ready.
 */
export function rosterAcceptBlockedReason(deck: MetaCandidateDeck): string | null {
  const count = deck.unresolvedNames.length;
  if (count > 0) {
    return `${count} card ${count === 1 ? "name" : "names"} still unmatched.`;
  }
  return null;
}
