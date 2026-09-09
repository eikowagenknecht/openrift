import { describe, expect, it, vi } from "vitest";

import type { Repos } from "../../../deps.js";
import {
  groupCutTournament,
  groupPlayers,
  groupRow,
  groupStageRoundRows,
  roundRows,
} from "../../../test/group-cut-fixtures.js";
import { buildGroupStageBundle } from "./group-cut-builders.js";
import type { GroupCutPlayer } from "./group-cut.js";

const GROUPS = [groupRow("A"), groupRow("B")];

function repos(): Repos {
  return {
    tournamentGroups: {
      listGroups: vi.fn(async () => GROUPS),
      listMetaShares: vi.fn(async () => []),
      legendCardNames: vi.fn(async () => new Map<string, string>()),
    },
  } as unknown as Repos;
}

function roster(patch: Partial<Record<string, Partial<GroupCutPlayer>>> = {}): GroupCutPlayer[] {
  return [...groupPlayers("A", 4), ...groupPlayers("B", 4)].map((player) => ({
    ...player,
    ...patch[player.id],
  }));
}

const PLAYED = groupStageRoundRows([
  { labels: ["A"], rounds: ["first", "first", "first"] },
  { labels: ["B"], rounds: ["first", "first", "first"] },
]);

/** The same stage with group A's round 1 reported the other way round. */
function corrected() {
  return groupStageRoundRows([
    { labels: ["A"], rounds: ["second", "first", "first"] },
    { labels: ["B"], rounds: ["first", "first", "first"] },
  ]);
}

describe("buildGroupStageBundle before the cut", () => {
  it("recomputes standings, ranking and provisional seeds from a corrected result", async () => {
    const players = roster();
    const before = await buildGroupStageBundle(repos(), groupCutTournament(), players, PLAYED);
    const after = await buildGroupStageBundle(repos(), groupCutTournament(), players, corrected());

    const orderOf = (
      bundle: Awaited<ReturnType<typeof buildGroupStageBundle>>,
      label: string,
    ): string[] =>
      bundle.groupStage?.groups
        .find((entry) => entry.label === label)
        ?.standings.map((row) => row.playerId) ?? [];

    expect(orderOf(before, "A")).toEqual(["a1", "a2", "a3", "a4"]);
    expect(orderOf(after, "A")).toEqual(["a2", "a1", "a4", "a3"]);
    expect(orderOf(after, "B")).toEqual(orderOf(before, "B"));

    const seedOf = (
      bundle: Awaited<ReturnType<typeof buildGroupStageBundle>>,
      playerId: string,
    ): number | null =>
      bundle.groupStage?.ranking.find((row) => row.playerId === playerId)?.seed ?? null;

    expect(seedOf(before, "a1")).not.toBeNull();
    expect(seedOf(after, "a2")).toBeLessThanOrEqual(2);
    expect(before.groupStage?.ranking.map((row) => row.playerId)).not.toEqual(
      after.groupStage?.ranking.map((row) => row.playerId),
    );
    expect(after.groupStage?.cutGenerated).toBe(false);
    expect(after.groupStage?.stageComplete).toBe(true);
  });
});

describe("buildGroupStageBundle after the cut", () => {
  const CUT = roundRows(4, [
    { podNumber: 1, playerIds: ["a1", "b2"], outcome: "open" },
    { podNumber: 2, playerIds: ["b1", "a2"], outcome: "open" },
  ]);

  it("moves the group standings but leaves the stored seeds and flags the divergence", async () => {
    const players = roster({
      a1: { seed: 1 },
      b1: { seed: 2 },
      a2: { seed: 3 },
      b2: { seed: 4 },
    });
    const rows = [...corrected(), CUT];
    const bundle = await buildGroupStageBundle(repos(), groupCutTournament(), players, rows);
    const groupA = bundle.groupStage?.groups.find((entry) => entry.label === "A");
    expect(groupA?.standings.map((row) => row.playerId)).toEqual(["a2", "a1", "a4", "a3"]);
    expect(bundle.groupStage?.ranking.find((row) => row.playerId === "a1")?.seed).toBe(1);
    expect(bundle.groupStage?.ranking.find((row) => row.playerId === "a2")?.seed).toBe(3);
    expect(bundle.groupStage?.cutGenerated).toBe(true);
    expect(bundle.groupStage?.seedsDiverged).toBe(true);
  });

  it("keeps seedsDiverged false while the stored seeds still match the derived order", async () => {
    const derived = await buildGroupStageBundle(repos(), groupCutTournament(), roster(), PLAYED);
    const order = (derived.groupStage?.ranking ?? [])
      .filter((row) => row.qualified)
      .map((row) => row.playerId);
    const players = roster(
      Object.fromEntries(order.map((playerId, index) => [playerId, { seed: index + 1 }])),
    );
    const bundle = await buildGroupStageBundle(repos(), groupCutTournament(), players, [
      ...PLAYED,
      CUT,
    ]);
    expect(bundle.groupStage?.seedsDiverged).toBe(false);
  });
});

describe("buildGroupStageBundle for a tournament without a group stage", () => {
  it("returns no group stage and no shares", async () => {
    const bundle = await buildGroupStageBundle(
      repos(),
      groupCutTournament({ format: "rounds" }),
      roster(),
      PLAYED,
    );
    expect(bundle).toEqual({ groupStage: null, legendMetaShares: [] });
  });
});
