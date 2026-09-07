import { describe, expect, it } from "vitest";

import {
  buildTeamUnits,
  collapseTeamByes,
  collapseTeamPods,
  expandTeamPairing,
} from "./team-units.js";
import type { TeamSnapshotPlayer } from "./team-units.js";
import type { PairingResult } from "./types.js";

function player(
  id: string,
  teamId: string | null,
  overrides: Partial<TeamSnapshotPlayer> = {},
): TeamSnapshotPlayer {
  return {
    id,
    teamId,
    score: 0,
    pods3: 0,
    pods4: 0,
    byes: 0,
    opponents: new Map(),
    ...overrides,
  };
}

describe("buildTeamUnits", () => {
  it("collapses two full teams into units carrying the members' shared aggregates", () => {
    const { units, membersByTeam, teamByPlayer, unteamedPlayerIds, incompleteTeamIds } =
      buildTeamUnits([
        player("a1", "A", { score: 6, byes: 1 }),
        player("a2", "A", { score: 6, byes: 1 }),
        player("b1", "B", { score: 3 }),
        player("b2", "B", { score: 3 }),
      ]);
    expect(units.map((unit) => unit.id).toSorted()).toEqual(["A", "B"]);
    const teamA = units.find((unit) => unit.id === "A");
    expect(teamA?.score).toBe(6);
    expect(teamA?.byes).toBe(1);
    expect(membersByTeam.get("A")).toEqual(["a1", "a2"]);
    expect(teamByPlayer.get("b2")).toBe("B");
    expect(unteamedPlayerIds).toEqual([]);
    expect(incompleteTeamIds).toEqual([]);
  });

  it("halves the folded player-level opponent counts back to team meetings", () => {
    const { units } = buildTeamUnits([
      player("a1", "A", {
        opponents: new Map([
          ["b1", 1],
          ["b2", 1],
        ]),
      }),
      player("a2", "A", {
        opponents: new Map([
          ["b1", 1],
          ["b2", 1],
        ]),
      }),
      player("b1", "B", {
        opponents: new Map([
          ["a1", 1],
          ["a2", 1],
        ]),
      }),
      player("b2", "B", {
        opponents: new Map([
          ["a1", 1],
          ["a2", 1],
        ]),
      }),
    ]);
    expect(units.find((unit) => unit.id === "A")?.opponents.get("B")).toBe(1);
    expect(units.find((unit) => unit.id === "B")?.opponents.get("A")).toBe(1);
  });

  it("skips opponents outside the input instead of counting them against nothing", () => {
    const { units } = buildTeamUnits([
      player("a1", "A", { opponents: new Map([["gone", 2]]) }),
      player("a2", "A"),
    ]);
    expect(units.find((unit) => unit.id === "A")?.opponents.size).toBe(0);
  });

  it("separates unteamed players and half-teams from the pairable units", () => {
    const { units, unteamedPlayerIds, incompleteTeamIds } = buildTeamUnits([
      player("a1", "A"),
      player("a2", "A"),
      player("lonely", null),
      player("half", "H"),
    ]);
    expect(units.map((unit) => unit.id)).toEqual(["A"]);
    expect(unteamedPlayerIds).toEqual(["lonely"]);
    expect(incompleteTeamIds).toEqual(["H"]);
  });

  it("returns nothing for an empty field", () => {
    const result = buildTeamUnits([]);
    expect(result.units).toEqual([]);
    expect(result.unteamedPlayerIds).toEqual([]);
    expect(result.incompleteTeamIds).toEqual([]);
  });
});

describe("expandTeamPairing", () => {
  it("expands size-2 team pods into size-4 player pods with sides adjacent", () => {
    const result: PairingResult = {
      pods: [{ size: 2, playerIds: ["A", "B"] }],
      totalPenalty: 42,
      perPod: [],
      strategy: "local-search",
    };
    const membersByTeam = new Map([
      ["A", ["a1", "a2"]],
      ["B", ["b1", "b2"]],
    ]);
    const expanded = expandTeamPairing(result, membersByTeam);
    expect(expanded.pods).toEqual([{ size: 4, playerIds: ["a1", "a2", "b1", "b2"] }]);
    expect(expanded.totalPenalty).toBe(42);
    expect(expanded.strategy).toBe("local-search");
  });
});

describe("collapseTeamPods", () => {
  const teamByPlayer = new Map([
    ["a1", "A"],
    ["a2", "A"],
    ["b1", "B"],
    ["b2", "B"],
    ["c1", "C"],
  ]);

  it("collapses a pod of two full teams to a team pod", () => {
    const { teamPods, invalidPodIndexes } = collapseTeamPods(
      [{ size: 4, playerIds: ["a1", "b1", "a2", "b2"] }],
      teamByPlayer,
    );
    expect(invalidPodIndexes).toEqual([]);
    expect(teamPods).toEqual([{ size: 2, playerIds: ["A", "B"] }]);
  });

  it("flags pods holding a half-team, an unknown player, or the wrong size", () => {
    const { teamPods, invalidPodIndexes } = collapseTeamPods(
      [
        { size: 4, playerIds: ["a1", "a2", "b1", "c1"] },
        { size: 4, playerIds: ["a1", "a2", "b1", "stranger"] },
        { size: 2, playerIds: ["a1", "b1"] },
      ],
      teamByPlayer,
    );
    expect(teamPods).toEqual([]);
    expect(invalidPodIndexes).toEqual([0, 1, 2]);
  });
});

describe("collapseTeamByes", () => {
  const teamByPlayer = new Map([
    ["a1", "A"],
    ["a2", "A"],
    ["b1", "B"],
    ["b2", "B"],
  ]);

  it("collapses whole-team byes and passes unteamed byes through", () => {
    const { byeTeamIds, unteamedByePlayerIds, partialByePlayerIds } = collapseTeamByes(
      ["a1", "a2", "walkin"],
      teamByPlayer,
    );
    expect(byeTeamIds).toEqual(["A"]);
    expect(unteamedByePlayerIds).toEqual(["walkin"]);
    expect(partialByePlayerIds).toEqual([]);
  });

  it("flags a bye that names only one member of a team", () => {
    const { byeTeamIds, partialByePlayerIds } = collapseTeamByes(["b1"], teamByPlayer);
    expect(byeTeamIds).toEqual([]);
    expect(partialByePlayerIds).toEqual(["b1"]);
  });

  it("returns nothing for an empty bye list", () => {
    const result = collapseTeamByes([], teamByPlayer);
    expect(result.byeTeamIds).toEqual([]);
    expect(result.unteamedByePlayerIds).toEqual([]);
    expect(result.partialByePlayerIds).toEqual([]);
  });
});
