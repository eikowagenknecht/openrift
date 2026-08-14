import type { Printing } from "@openrift/shared";

/** Most rows the picker will offer for one query. */
export const SEARCH_RESULT_LIMIT = 40;

/**
 * Rank buckets, best first. An exact name match beats a prefix match beats a
 * substring match, so typing "yasuo" puts Yasuo above "Yasuo's Resolve".
 */
const EXACT = 0;
const PREFIX = 1;
const SUBSTRING = 2;

function rank(name: string, code: string, needle: string): number | null {
  if (name === needle || code === needle) {
    return EXACT;
  }
  if (name.startsWith(needle) || code.startsWith(needle)) {
    return PREFIX;
  }
  if (name.includes(needle)) {
    return SUBSTRING;
  }
  return null;
}

/**
 * Name/code search over the catalog for the presentation and overlay pickers.
 *
 * One row per card, not per printing: the queue is about which card goes on
 * screen, and offering eight language variants of the same card would bury the
 * rest of the results. The first printing of each card wins, which is the
 * caller's language-preference order (see `useCards`).
 *
 * @returns Matching printings, best match first, capped at the result limit.
 */
export function searchPrintingsByName(
  query: string,
  printings: readonly Printing[],
  limit: number = SEARCH_RESULT_LIMIT,
): Printing[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return [];
  }

  const bestByCard = new Map<string, { printing: Printing; rank: number; order: number }>();
  let order = 0;
  for (const printing of printings) {
    const score = rank(printing.card.name.toLowerCase(), printing.publicCode.toLowerCase(), needle);
    if (score === null) {
      continue;
    }
    const existing = bestByCard.get(printing.cardId);
    if (existing === undefined || score < existing.rank) {
      bestByCard.set(printing.cardId, { printing, rank: score, order: order++ });
    }
  }

  return [...bestByCard.values()]
    .toSorted((a, b) => a.rank - b.rank || a.order - b.order)
    .slice(0, limit)
    .map((entry) => entry.printing);
}

/**
 * Moves one entry within the queue, clamped at both ends so the last card's
 * "down" button is a no-op rather than dropping it off the list.
 *
 * @returns A new array with the entry moved.
 */
export function moveQueueEntry(ids: readonly string[], from: number, delta: number): string[] {
  const to = from + delta;
  if (from < 0 || from >= ids.length || to < 0 || to >= ids.length) {
    return [...ids];
  }
  const next = [...ids];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) {
    return [...ids];
  }
  next.splice(to, 0, moved);
  return next;
}
