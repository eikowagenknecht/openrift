import type { MetaCrossSourceRow } from "@openrift/shared";

export interface MetaCrossSourceProgress {
  total: number;
  linked: number;
  distinct: number;
  unreviewed: number;
}

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

export interface CrossSourceAutoLink {
  provider: string;
  sourceIdentity: string;
  playerName: string;
  metaEventPlayerId: string;
}

/**
 * Only the undecided entries with exactly one exact suggestion (same
 * normalized name and finish). Two entries reaching for one live row are both left out.
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
