import type { MetaEventPlayer } from "@openrift/shared/types/api/meta";

export const ANY_LEGEND = "any";

/** The legends the field played, commonest first. Keyed by card id so legends sharing a champion stay apart. */
export function legendOptions(players: readonly MetaEventPlayer[]): Record<string, string> {
  const counts = new Map<string, { name: string; count: number }>();
  for (const player of players) {
    if (player.legend === null) {
      continue;
    }
    const seen = counts.get(player.legend.cardId);
    counts.set(player.legend.cardId, {
      name: player.legend.name,
      count: (seen?.count ?? 0) + 1,
    });
  }
  if (counts.size < 2) {
    return {};
  }
  const ordered = [...counts.entries()].sort(
    (a, b) => b[1].count - a[1].count || a[1].name.localeCompare(b[1].name),
  );
  return {
    [ANY_LEGEND]: "Any legend",
    ...Object.fromEntries(
      ordered.map(([cardId, entry]) => [cardId, `${entry.name} (${entry.count})`]),
    ),
  };
}

export interface RowSlot {
  "data-index"?: number;
  ref?: (node: HTMLElement | null) => void;
  style?: React.CSSProperties;
}

export interface StandingsColumns {
  legend: boolean;
  run: boolean;
  value: boolean;
  deck: boolean;
}

export function standingsColumns(
  players: readonly MetaEventPlayer[],
  canSubmit: boolean,
  hasRuns: boolean,
): StandingsColumns {
  const anyList = players.some((player) => player.shareToken !== null);
  return {
    legend: players.some((player) => player.legend !== null || player.champion !== null),
    run: hasRuns,
    value: anyList,
    deck: canSubmit || anyList,
  };
}

export function subtitleFor(total: number, withLists: number): string {
  const entries = `${total.toLocaleString("en-US")} ${total === 1 ? "entry" : "entries"}`;
  if (withLists === 0) {
    return entries;
  }
  return `${entries} · ${withLists.toLocaleString("en-US")} with a decklist`;
}
