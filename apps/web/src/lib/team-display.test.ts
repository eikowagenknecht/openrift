import type { PodMemberResponse, PodStandingRow } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import {
  collapseTeamStandings,
  groupPodMembersByTeam,
  teamDisplayName,
  teamNamesById,
} from "./team-display";

function member(
  playerId: string,
  teamId: string | null,
  displayName = `Player ${playerId}`,
): PodMemberResponse {
  return { playerId, displayName, teamId, gamePoints: null, placement: null, points: null };
}

function standingRow(
  playerId: string,
  teamId: string | null,
  overrides: Partial<PodStandingRow> = {},
): PodStandingRow {
  return {
    playerId,
    displayName: `Player ${playerId}`,
    status: "active",
    droppedAfterRound: null,
    teamId,
    score: 0,
    gamePoints: 0,
    roundsPlayed: 0,
    pods3Count: 0,
    pods4Count: 0,
    byeCount: 0,
    podWins: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    region: null,
    avgOpponentScore: 0,
    avgOpponentGamePoints: 0,
    ...overrides,
  };
}

describe("teamDisplayName", () => {
  it("joins member names with an ampersand", () => {
    expect(teamDisplayName(["Ashe", "Braum"])).toBe("Ashe & Braum");
  });

  it("passes a single name through", () => {
    expect(teamDisplayName(["Ashe"])).toBe("Ashe");
  });
});

describe("groupPodMembersByTeam", () => {
  it("groups a team match into its two sides in first-appearance order", () => {
    const groups = groupPodMembersByTeam([
      member("a1", "A"),
      member("a2", "A"),
      member("b1", "B"),
      member("b2", "B"),
    ]);
    expect(groups.map((group) => group.map((m) => m.playerId))).toEqual([
      ["a1", "a2"],
      ["b1", "b2"],
    ]);
  });

  it("keeps interleaved seats grouped by team", () => {
    const groups = groupPodMembersByTeam([
      member("a1", "A"),
      member("b1", "B"),
      member("a2", "A"),
      member("b2", "B"),
    ]);
    expect(groups.map((group) => group.map((m) => m.playerId))).toEqual([
      ["a1", "a2"],
      ["b1", "b2"],
    ]);
  });

  it("gives teamless members a group of their own", () => {
    const groups = groupPodMembersByTeam([member("x", null), member("y", null)]);
    expect(groups).toHaveLength(2);
  });

  it("returns nothing for an empty pod", () => {
    expect(groupPodMembersByTeam([])).toEqual([]);
  });
});

describe("teamNamesById", () => {
  it("joins each team's member names and skips teamless rows", () => {
    const names = teamNamesById([
      { teamId: "A", displayName: "Ashe" },
      { teamId: "A", displayName: "Braum" },
      { teamId: null, displayName: "Caitlyn" },
    ]);
    expect(names.get("A")).toBe("Ashe & Braum");
    expect(names.size).toBe(1);
  });
});

describe("collapseTeamStandings", () => {
  it("keeps one row per team with the joined name and preserves order", () => {
    const rows = collapseTeamStandings([
      standingRow("a1", "A", { score: 9 }),
      standingRow("a2", "A", { score: 9 }),
      standingRow("b1", "B", { score: 6 }),
      standingRow("b2", "B", { score: 6 }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.displayName).toBe("Player a1 & Player a2");
    expect(rows[0]!.score).toBe(9);
    expect(rows[1]!.displayName).toBe("Player b1 & Player b2");
  });

  it("collapses teammates even when another team's rows sit between them", () => {
    const rows = collapseTeamStandings([
      standingRow("a1", "A"),
      standingRow("b1", "B"),
      standingRow("a2", "A"),
      standingRow("b2", "B"),
    ]);
    expect(rows.map((row) => row.displayName)).toEqual([
      "Player a1 & Player a2",
      "Player b1 & Player b2",
    ]);
  });

  it("passes teamless rows through unchanged", () => {
    const rows = collapseTeamStandings([standingRow("solo", null)]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.displayName).toBe("Player solo");
  });

  it("returns nothing for empty standings", () => {
    expect(collapseTeamStandings([])).toEqual([]);
  });
});
