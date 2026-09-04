import type { MetaCrossSourceRow } from "@openrift/shared";

// The cross-mirror review's pure parts (ADR-014, "Two mirrors on one event"):
// how far along one mirror's review is, and which of its entries are safe to
// link in one go.

export interface MetaCrossSourceProgress {
  total: number;
  linked: number;
  distinct: number;
  unreviewed: number;
}

/**
 * How much of one mirror's review is done.
 *
 * @param rows - The review's rows, of every mirror.
 * @param provider - The mirror to count.
 * @returns The four counts, which the panel's header prints.
 */
export function crossSourceProgress(
  rows: readonly MetaCrossSourceRow[],
  provider: string,
): MetaCrossSourceProgress {
  const mine = rows.filter((row) => row.provider === provider);
  return {
    total: mine.length,
    linked: mine.filter((row) => row.state === "linked").length,
    distinct: mine.filter((row) => row.state === "distinct").length,
    unreviewed: mine.filter((row) => row.state === "unreviewed").length,
  };
}

/** One entry the bulk action would link, and the live row it would link it to. */
export interface CrossSourceAutoLink {
  provider: string;
  sourceIdentity: string;
  playerName: string;
  metaEventPlayerId: string;
}

/**
 * The undecided entries whose match needs no judgement: exactly one suggestion
 * is exact, meaning the same normalized name and the same finish. Two entries
 * reaching for one live row are both left out; a human settles those.
 *
 * @param rows - The review's rows.
 * @returns The links the bulk action would write, in the rows' own order.
 */
export function crossSourceAutoLinks(rows: readonly MetaCrossSourceRow[]): CrossSourceAutoLink[] {
  const picks: CrossSourceAutoLink[] = [];
  for (const row of rows) {
    const exact = row.suggestions.filter((suggestion) => suggestion.isExact);
    const [only] = exact;
    if (row.state !== "unreviewed" || exact.length !== 1 || only === undefined) {
      continue;
    }
    picks.push({
      provider: row.provider,
      sourceIdentity: row.sourceIdentity,
      playerName: row.playerName,
      metaEventPlayerId: only.metaEventPlayerId,
    });
  }

  const target = (pick: CrossSourceAutoLink): string =>
    `${pick.provider}:${pick.metaEventPlayerId}`;
  const reaches = new Map<string, number>();
  for (const pick of picks) {
    reaches.set(target(pick), (reaches.get(target(pick)) ?? 0) + 1);
  }
  return picks.filter((pick) => reaches.get(target(pick)) === 1);
}
