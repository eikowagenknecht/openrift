import type {
  GroupCutTier,
  GroupMatch,
  GroupStageRanking,
  GroupStandingRow,
  GroupStandings,
  GroupStandingsInput,
  LegendTiebreakInput,
  QualificationRow,
} from "./group-cut-types.js";

export function matchWinRate(wins: number, draws: number, played: number): number {
  return played === 0 ? 0 : (wins + draws / 2) / played;
}

export function gameWinRate(won: number, played: number): number | null {
  return played === 0 ? null : won / played;
}

interface Tally {
  points: number;
  wins: number;
  losses: number;
  draws: number;
  gamesWon: number;
  gamesPlayed: number;
  played: number;
}

function emptyTally(): Tally {
  return { points: 0, wins: 0, losses: 0, draws: 0, gamesWon: 0, gamesPlayed: 0, played: 0 };
}

function buildTallies(
  matches: readonly GroupMatch[],
  scope: ReadonlySet<string>,
  winPoints: number,
  drawPoints: number,
): Map<string, Tally> {
  const tallies = new Map<string, Tally>();
  for (const playerId of scope) {
    tallies.set(playerId, emptyTally());
  }
  for (const match of matches) {
    const [first, second] = match.playerIds;
    const placements = match.placements;
    if (placements === null || !scope.has(first) || !scope.has(second)) {
      continue;
    }
    const firstTally = tallies.get(first);
    const secondTally = tallies.get(second);
    if (firstTally === undefined || secondTally === undefined) {
      continue;
    }
    firstTally.played++;
    secondTally.played++;
    const [firstPlace, secondPlace] = placements;
    if (firstPlace === secondPlace) {
      firstTally.draws++;
      secondTally.draws++;
      firstTally.points += drawPoints;
      secondTally.points += drawPoints;
    } else if (firstPlace < secondPlace) {
      firstTally.wins++;
      secondTally.losses++;
      firstTally.points += winPoints;
    } else {
      secondTally.wins++;
      firstTally.losses++;
      secondTally.points += winPoints;
    }
    const [firstGames, secondGames] = match.gamePoints;
    if (firstGames !== null && secondGames !== null) {
      const total = firstGames + secondGames;
      firstTally.gamesWon += firstGames;
      firstTally.gamesPlayed += total;
      secondTally.gamesWon += secondGames;
      secondTally.gamesPlayed += total;
    }
  }
  return tallies;
}

function tallyOf(tallies: ReadonlyMap<string, Tally>, playerId: string): Tally {
  return tallies.get(playerId) ?? emptyTally();
}

function negate(value: number | null): number | null {
  return value === null ? null : -value;
}

function compareKeys(a: number | null, b: number | null): number {
  if (a === null && b === null) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  return a - b;
}

function bucketByKey(
  playerIds: readonly string[],
  key: (playerId: string) => number | null,
): string[][] {
  const sorted = playerIds.toSorted((a, b) => compareKeys(key(a), key(b)));
  const buckets: string[][] = [];
  for (const playerId of sorted) {
    const last = buckets.at(-1);
    const head = last?.[0];
    if (last !== undefined && head !== undefined && compareKeys(key(head), key(playerId)) === 0) {
      last.push(playerId);
    } else {
      buckets.push([playerId]);
    }
  }
  return buckets;
}

interface Ordered {
  playerId: string;
  tier: GroupCutTier | null;
}

function joinBuckets(
  buckets: readonly string[][],
  boundary: GroupCutTier | null,
  resolve: (bucket: string[]) => Ordered[],
): Ordered[] {
  const ordered: Ordered[] = [];
  for (const [index, bucket] of buckets.entries()) {
    const rows = resolve(bucket);
    for (const [position, row] of rows.entries()) {
      ordered.push({
        playerId: row.playerId,
        tier: position === 0 ? (index === 0 ? null : boundary) : row.tier,
      });
    }
  }
  return ordered;
}

type Step =
  | { kind: "key"; tier: GroupCutTier; key: (playerId: string) => number | null }
  | { kind: "meta"; legend: LegendTiebreakInput };

function legendOf(legend: LegendTiebreakInput, playerId: string): string | null {
  return legend.legendByPlayer.get(playerId) ?? null;
}

function metaShareOf(legend: LegendTiebreakInput, playerId: string): number | null {
  const legendId = legendOf(legend, playerId);
  return legendId === null ? null : (legend.metaShareByLegend.get(legendId) ?? null);
}

function legendSteps(legend: LegendTiebreakInput | null): Step[] {
  if (legend === null) {
    return [];
  }
  const counts = new Map<string, number>();
  for (const legendId of legend.legendByPlayer.values()) {
    if (legendId !== null) {
      counts.set(legendId, (counts.get(legendId) ?? 0) + 1);
    }
  }
  return [
    {
      kind: "key",
      tier: "legend_count",
      key: (playerId) => {
        const legendId = legendOf(legend, playerId);
        return legendId === null ? null : (counts.get(legendId) ?? 0);
      },
    },
    { kind: "meta", legend },
  ];
}

function resolveSteps(
  playerIds: readonly string[],
  steps: readonly Step[],
  pending: Set<string>,
): Ordered[] {
  if (playerIds.length <= 1) {
    return playerIds.map((playerId) => ({ playerId, tier: null }));
  }
  const [step, ...rest] = steps;
  if (step === undefined) {
    return playerIds.map((playerId, index) => ({
      playerId,
      tier: index === 0 ? null : ("draw" as const),
    }));
  }
  if (step.kind === "meta") {
    const missing = playerIds.filter((playerId) => metaShareOf(step.legend, playerId) === null);
    if (missing.length > 0) {
      for (const playerId of missing) {
        const legendId = legendOf(step.legend, playerId);
        if (legendId !== null) {
          pending.add(legendId);
        }
      }
      return playerIds.map((playerId, index) => ({
        playerId,
        tier: index === 0 ? null : ("meta_pending" as const),
      }));
    }
    const share: Step = {
      kind: "key",
      tier: "meta_share",
      key: (playerId) => metaShareOf(step.legend, playerId),
    };
    return resolveSteps(playerIds, [share, ...rest], pending);
  }
  const buckets = bucketByKey(playerIds, step.key);
  return joinBuckets(buckets, step.tier, (bucket) => resolveSteps(bucket, rest, pending));
}

interface GroupContext {
  matches: readonly GroupMatch[];
  tallies: ReadonlyMap<string, Tally>;
  winPoints: number;
  drawPoints: number;
  steps: readonly Step[];
  pending: Set<string>;
}

function headToHead(first: string, second: string, matches: readonly GroupMatch[]): number {
  for (const match of matches) {
    if (match.placements === null) {
      continue;
    }
    const [a, b] = match.playerIds;
    const [placeA, placeB] = match.placements;
    if (placeA === placeB) {
      continue;
    }
    if (a === first && b === second) {
      return placeA < placeB ? -1 : 1;
    }
    if (a === second && b === first) {
      return placeA < placeB ? 1 : -1;
    }
  }
  return 0;
}

function miniTableBuckets(playerIds: readonly string[], context: GroupContext): string[][] {
  const scope = new Set(playerIds);
  const tallies = buildTallies(context.matches, scope, context.winPoints, context.drawPoints);
  const buckets: string[][] = [];
  for (const bucket of bucketByKey(playerIds, (id) => -tallyOf(tallies, id).points)) {
    buckets.push(
      ...bucketByKey(bucket, (id) => {
        const tally = tallyOf(tallies, id);
        return negate(gameWinRate(tally.gamesWon, tally.gamesPlayed));
      }),
    );
  }
  return buckets;
}

function resolveGroupTie(playerIds: readonly string[], context: GroupContext): Ordered[] {
  if (playerIds.length <= 1) {
    return playerIds.map((playerId) => ({ playerId, tier: null }));
  }
  if (playerIds.length === 2) {
    const [first, second] = playerIds;
    if (first === undefined || second === undefined) {
      throw new Error("resolveGroupTie: missing player in a two-player tie");
    }
    const decision = headToHead(first, second, context.matches);
    if (decision !== 0) {
      const [winner, loser] = decision < 0 ? [first, second] : [second, first];
      return [
        { playerId: winner, tier: null },
        { playerId: loser, tier: "h2h" },
      ];
    }
    return resolveSteps(playerIds, context.steps, context.pending);
  }
  const buckets = miniTableBuckets(playerIds, context);
  if (buckets.length > 1) {
    return joinBuckets(buckets, "mini_table", (bucket) => resolveGroupTie(bucket, context));
  }
  return resolveSteps(playerIds, context.steps, context.pending);
}

function orderGroup(playerIds: readonly string[], context: GroupContext): Ordered[] {
  const buckets = bucketByKey(playerIds, (id) => -tallyOf(context.tallies, id).points);
  return joinBuckets(buckets, null, (bucket) => resolveGroupTie(bucket, context));
}

export function computeGroupStage(input: GroupStandingsInput): GroupStageRanking {
  const field = new Set(input.groups.flatMap((group) => group.playerIds));
  const overall = buildTallies(input.matches, field, input.winPoints, input.drawPoints);
  const pending = new Set<string>();
  const legend = legendSteps(input.legend);
  const byKey = (a: string, b: string): number => input.tieBreakKey(a) - input.tieBreakKey(b);

  const groups: GroupStandings[] = [];
  const qualification: QualificationRow[] = [];

  for (const group of input.groups) {
    const scope = new Set(group.playerIds);
    const matches = input.matches.filter(
      (match) => scope.has(match.playerIds[0]) && scope.has(match.playerIds[1]),
    );
    const tallies = buildTallies(matches, scope, input.winPoints, input.drawPoints);
    const context: GroupContext = {
      matches,
      tallies,
      winPoints: input.winPoints,
      drawPoints: input.drawPoints,
      steps: [
        {
          kind: "key",
          tier: "gw",
          key: (id) => {
            const tally = tallyOf(tallies, id);
            return negate(gameWinRate(tally.gamesWon, tally.gamesPlayed));
          },
        },
        ...legend,
        { kind: "key", tier: "draw", key: input.tieBreakKey },
      ],
      pending,
    };
    const ordered = orderGroup(group.playerIds.toSorted(byKey), context);
    const rows: GroupStandingRow[] = ordered.map((row, index) => {
      const tally = tallyOf(tallies, row.playerId);
      return {
        playerId: row.playerId,
        place: index + 1,
        points: tally.points,
        wins: tally.wins,
        losses: tally.losses,
        draws: tally.draws,
        gamesWon: tally.gamesWon,
        gamesPlayed: tally.gamesPlayed,
        gameWinRate: gameWinRate(tally.gamesWon, tally.gamesPlayed),
        decidedBy: row.tier,
      };
    });
    groups.push({ label: group.label, rows });
    for (const row of rows) {
      qualification.push({
        playerId: row.playerId,
        groupLabel: group.label,
        place: row.place,
        matchWinRate: 0,
        gameWinRate: null,
        decidedBy: null,
      });
    }
  }

  const rankingSteps: Step[] = [
    {
      kind: "key",
      tier: "mw",
      key: (id) => {
        const tally = tallyOf(overall, id);
        return -matchWinRate(tally.wins, tally.draws, tally.played);
      },
    },
    {
      kind: "key",
      tier: "gw",
      key: (id) => {
        const tally = tallyOf(overall, id);
        return negate(gameWinRate(tally.gamesWon, tally.gamesPlayed));
      },
    },
    ...legend,
    { kind: "key", tier: "draw", key: input.tieBreakKey },
  ];

  const byPlayer = new Map(qualification.map((row) => [row.playerId, row]));
  const byPlace = Map.groupBy(qualification, (row) => row.place);
  const ranking: QualificationRow[] = [];
  for (const place of [...byPlace.keys()].toSorted((a, b) => a - b)) {
    const tied = (byPlace.get(place) ?? []).map((row) => row.playerId).toSorted(byKey);
    for (const row of resolveSteps(tied, rankingSteps, pending)) {
      const base = byPlayer.get(row.playerId);
      const tally = tallyOf(overall, row.playerId);
      if (base === undefined) {
        continue;
      }
      ranking.push({
        ...base,
        matchWinRate: matchWinRate(tally.wins, tally.draws, tally.played),
        gameWinRate: gameWinRate(tally.gamesWon, tally.gamesPlayed),
        decidedBy: row.tier,
      });
    }
  }

  return { groups, ranking, pendingMetaLegendIds: [...pending] };
}
