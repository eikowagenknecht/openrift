import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import type { TeamId, TrackedPlayer } from "./match-tracker-store";
import {
  defaultPointsTarget,
  describeAction,
  isMatchPoint,
  teamMemberCounts,
  teammateIds,
  useMatchTrackerStore,
} from "./match-tracker-store";

let resetStore: () => void;

function player(id: string, team: TeamId, points = 0): TrackedPlayer {
  return { id, name: id.toUpperCase(), points, xp: 0, team, legend: null, xpOpen: false };
}

// Switch to a four-player 2v2, start playing, and return the fresh roster.
function startTeamsGame(): TrackedPlayer[] {
  useMatchTrackerStore.getState().setPlayerCount(4);
  useMatchTrackerStore.getState().setMode("teams");
  useMatchTrackerStore.getState().startGame();
  return useMatchTrackerStore.getState().players;
}

beforeEach(() => {
  resetStore = createStoreResetter(useMatchTrackerStore);
});

afterEach(() => {
  resetStore();
});

describe("defaultPointsTarget", () => {
  it("is 11 for a 2v2 and 8 for every other format", () => {
    expect(defaultPointsTarget("teams")).toBe(11);
    expect(defaultPointsTarget("ffa")).toBe(8);
  });
});

describe("teamMemberCounts", () => {
  it("counts members on each team", () => {
    expect(
      teamMemberCounts([player("a", 0), player("b", 0), player("c", 1), player("d", 1)]),
    ).toEqual([2, 2]);
    expect(teamMemberCounts([player("a", 0), player("b", 1), player("c", 1)])).toEqual([1, 2]);
  });
});

describe("teammateIds", () => {
  it("returns the ids on a given team", () => {
    const roster = [player("a", 0), player("b", 1), player("c", 0)];
    expect(teammateIds(roster, 0)).toEqual(["a", "c"]);
    expect(teammateIds(roster, 1)).toEqual(["b"]);
  });
});

describe("useMatchTrackerStore", () => {
  it("starts in setup free-for-all with two default players", () => {
    const state = useMatchTrackerStore.getState();
    expect(state.status).toBe("setup");
    expect(state.mode).toBe("ffa");
    expect(state.players).toHaveLength(2);
    expect(state.players.map((entry) => entry.name)).toEqual(["Player 1", "Player 2"]);
    expect(state.pointsTarget).toBe(8);
    expect(state.firstPlayerId).toBeNull();
    expect(state.spotlightPlayerId).toBeNull();
    expect(state.winnerId).toBeNull();
  });

  describe("setPlayerCount", () => {
    it("grows the roster, keeps free-for-all, and uses the 8-point default", () => {
      useMatchTrackerStore.getState().setPlayerCount(4);
      const state = useMatchTrackerStore.getState();
      expect(state.players).toHaveLength(4);
      expect(state.players[3]?.name).toBe("Player 4");
      expect(state.players[3]?.team).toBe(1);
      expect(state.mode).toBe("ffa");
      expect(state.pointsTarget).toBe(8);
    });

    it("trims the roster from the end and resets the target", () => {
      useMatchTrackerStore.getState().setPlayerCount(4);
      useMatchTrackerStore.getState().setPlayerCount(2);
      const state = useMatchTrackerStore.getState();
      expect(state.players).toHaveLength(2);
      expect(state.pointsTarget).toBe(8);
    });

    it("drops teams back to free-for-all when leaving four players", () => {
      useMatchTrackerStore.getState().setPlayerCount(4);
      useMatchTrackerStore.getState().setMode("teams");
      useMatchTrackerStore.getState().setPlayerCount(3);
      const state = useMatchTrackerStore.getState();
      expect(state.mode).toBe("ffa");
      expect(state.pointsTarget).toBe(8);
    });

    it("clamps below the minimum and above the maximum", () => {
      useMatchTrackerStore.getState().setPlayerCount(1);
      expect(useMatchTrackerStore.getState().players).toHaveLength(2);
      useMatchTrackerStore.getState().setPlayerCount(9);
      expect(useMatchTrackerStore.getState().players).toHaveLength(4);
    });
  });

  describe("setMode", () => {
    it("switches a four-player game to 2v2 with the 11-point default", () => {
      useMatchTrackerStore.getState().setPlayerCount(4);
      useMatchTrackerStore.getState().setMode("teams");
      expect(useMatchTrackerStore.getState().mode).toBe("teams");
      expect(useMatchTrackerStore.getState().pointsTarget).toBe(11);
      useMatchTrackerStore.getState().setMode("ffa");
      expect(useMatchTrackerStore.getState().mode).toBe("ffa");
      expect(useMatchTrackerStore.getState().pointsTarget).toBe(8);
    });

    it("ignores a teams request without four players", () => {
      useMatchTrackerStore.getState().setMode("teams");
      expect(useMatchTrackerStore.getState().mode).toBe("ffa");
    });
  });

  describe("setPlayerTeam", () => {
    it("moves a player to the other team", () => {
      useMatchTrackerStore.getState().setPlayerCount(4);
      const [first] = useMatchTrackerStore.getState().players;
      useMatchTrackerStore.getState().setPlayerTeam(first!.id, 1);
      expect(useMatchTrackerStore.getState().players[0]?.team).toBe(1);
    });
  });

  describe("renamePlayer", () => {
    it("renames only the targeted player", () => {
      const [first, second] = useMatchTrackerStore.getState().players;
      useMatchTrackerStore.getState().renamePlayer(first!.id, "Alice");
      const players = useMatchTrackerStore.getState().players;
      expect(players[0]?.name).toBe("Alice");
      expect(players[1]?.name).toBe(second!.name);
    });
  });

  describe("setPointsTarget", () => {
    it("floors fractional values and clamps to at least 1", () => {
      useMatchTrackerStore.getState().setPointsTarget(12.9);
      expect(useMatchTrackerStore.getState().pointsTarget).toBe(12);
      useMatchTrackerStore.getState().setPointsTarget(0);
      expect(useMatchTrackerStore.getState().pointsTarget).toBe(1);
    });
  });

  describe("startGame", () => {
    it("zeroes counters, clears the winner, and switches to playing", () => {
      const store = useMatchTrackerStore.getState();
      const [first] = store.players;
      store.adjustPoints(first!.id, 3);
      store.adjustXp(first!.id, 5);
      useMatchTrackerStore.getState().startGame();
      const state = useMatchTrackerStore.getState();
      expect(state.status).toBe("playing");
      expect(state.players.every((entry) => entry.points === 0 && entry.xp === 0)).toBe(true);
      expect(state.winnerId).toBeNull();
      expect(state.firstPlayerId).toBeNull();
      expect(state.spotlightPlayerId).toBeNull();
    });

    it("keeps the format and team assignments", () => {
      useMatchTrackerStore.getState().setPlayerCount(4);
      useMatchTrackerStore.getState().setMode("teams");
      const teamsBefore = useMatchTrackerStore.getState().players.map((entry) => entry.team);
      useMatchTrackerStore.getState().startGame();
      expect(useMatchTrackerStore.getState().mode).toBe("teams");
      expect(useMatchTrackerStore.getState().players.map((entry) => entry.team)).toEqual(
        teamsBefore,
      );
    });

    it("clears a stale first player and spotlight from the previous game", () => {
      const [first] = useMatchTrackerStore.getState().players;
      useMatchTrackerStore.getState().setFirstPlayer(first!.id);
      useMatchTrackerStore.getState().setSpotlightPlayer(first!.id);
      useMatchTrackerStore.getState().startGame();
      expect(useMatchTrackerStore.getState().firstPlayerId).toBeNull();
      expect(useMatchTrackerStore.getState().spotlightPlayerId).toBeNull();
    });
  });

  describe("adjustPoints", () => {
    it("never drops below zero", () => {
      const [first] = useMatchTrackerStore.getState().players;
      useMatchTrackerStore.getState().adjustPoints(first!.id, -5);
      expect(useMatchTrackerStore.getState().players[0]?.points).toBe(0);
    });

    it("declares a winner when a player crosses the target", () => {
      useMatchTrackerStore.getState().startGame();
      const [first] = useMatchTrackerStore.getState().players;
      useMatchTrackerStore.getState().adjustPoints(first!.id, 8);
      const state = useMatchTrackerStore.getState();
      expect(state.status).toBe("finished");
      expect(state.winnerId).toBe(first!.id);
    });

    it("does not re-fire the winner after the banner is dismissed", () => {
      useMatchTrackerStore.getState().startGame();
      const [first] = useMatchTrackerStore.getState().players;
      useMatchTrackerStore.getState().adjustPoints(first!.id, 8);
      useMatchTrackerStore.getState().dismissWinner();
      expect(useMatchTrackerStore.getState().status).toBe("playing");
      expect(useMatchTrackerStore.getState().winnerId).toBeNull();
      // Already at/above target — nudging again must not re-announce.
      useMatchTrackerStore.getState().adjustPoints(first!.id, 1);
      expect(useMatchTrackerStore.getState().status).toBe("playing");
      expect(useMatchTrackerStore.getState().winnerId).toBeNull();
    });

    it("moves both teammates together in a 2v2", () => {
      const players = startTeamsGame();
      const teamOne = players.filter((entry) => entry.team === 0);
      const teamTwo = players.filter((entry) => entry.team === 1);
      useMatchTrackerStore.getState().adjustPoints(teamOne[0]!.id, 1);
      const updated = useMatchTrackerStore.getState().players;
      expect(updated.filter((entry) => entry.team === 0).every((entry) => entry.points === 1)).toBe(
        true,
      );
      expect(updated.filter((entry) => entry.team === 1).every((entry) => entry.points === 0)).toBe(
        true,
      );
      // Teammate ids untouched on the other team.
      expect(teamTwo).toHaveLength(2);
    });

    it("declares the crossing team's player as winner in a 2v2", () => {
      startTeamsGame();
      useMatchTrackerStore.getState().setPointsTarget(2);
      const teamOne = useMatchTrackerStore.getState().players.filter((entry) => entry.team === 0);
      useMatchTrackerStore.getState().adjustPoints(teamOne[0]!.id, 2);
      const state = useMatchTrackerStore.getState();
      expect(state.status).toBe("finished");
      expect(state.winnerId).toBe(teamOne[0]!.id);
      expect(
        state.players.filter((entry) => entry.team === 0).every((entry) => entry.points === 2),
      ).toBe(true);
    });
  });

  describe("adjustXp", () => {
    it("accumulates with no cap and floors at zero", () => {
      const [first] = useMatchTrackerStore.getState().players;
      useMatchTrackerStore.getState().adjustXp(first!.id, 100);
      expect(useMatchTrackerStore.getState().players[0]?.xp).toBe(100);
      useMatchTrackerStore.getState().adjustXp(first!.id, -1000);
      expect(useMatchTrackerStore.getState().players[0]?.xp).toBe(0);
    });

    it("stays per-player in a 2v2", () => {
      const players = startTeamsGame();
      const teamOne = players.filter((entry) => entry.team === 0);
      useMatchTrackerStore.getState().adjustXp(teamOne[0]!.id, 3);
      const updated = useMatchTrackerStore.getState().players;
      expect(updated.find((entry) => entry.id === teamOne[0]!.id)?.xp).toBe(3);
      expect(updated.find((entry) => entry.id === teamOne[1]!.id)?.xp).toBe(0);
    });
  });

  describe("setFirstPlayer", () => {
    it("marks the given player as first", () => {
      const [, second] = useMatchTrackerStore.getState().players;
      useMatchTrackerStore.getState().setFirstPlayer(second!.id);
      expect(useMatchTrackerStore.getState().firstPlayerId).toBe(second!.id);
    });

    it("ignores ids that are not in the roster", () => {
      const [first] = useMatchTrackerStore.getState().players;
      useMatchTrackerStore.getState().setFirstPlayer(first!.id);
      useMatchTrackerStore.getState().setFirstPlayer("ghost");
      expect(useMatchTrackerStore.getState().firstPlayerId).toBe(first!.id);
    });

    it("clears the first player when passed null", () => {
      const [first] = useMatchTrackerStore.getState().players;
      useMatchTrackerStore.getState().setFirstPlayer(first!.id);
      useMatchTrackerStore.getState().setFirstPlayer(null);
      expect(useMatchTrackerStore.getState().firstPlayerId).toBeNull();
    });
  });

  describe("setSpotlightPlayer", () => {
    it("sets and clears the transient spotlight target", () => {
      const [first] = useMatchTrackerStore.getState().players;
      useMatchTrackerStore.getState().setSpotlightPlayer(first!.id);
      expect(useMatchTrackerStore.getState().spotlightPlayerId).toBe(first!.id);
      useMatchTrackerStore.getState().setSpotlightPlayer(null);
      expect(useMatchTrackerStore.getState().spotlightPlayerId).toBeNull();
    });
  });

  describe("persistence merge", () => {
    const merge = useMatchTrackerStore.persist?.getOptions().merge;

    it("falls back to current state for an out-of-range roster", () => {
      const current = useMatchTrackerStore.getState();
      const result = merge?.({ players: [{ id: "a", name: "Solo", points: 0, xp: 0 }] }, current);
      expect(result?.players).toBe(current.players);
    });

    it("clamps negative counters and rejects ids outside the roster", () => {
      const current = useMatchTrackerStore.getState();
      const result = merge?.(
        {
          status: "playing",
          players: [
            { id: "a", name: "A", points: -3, xp: 4.7 },
            { id: "b", name: "B", points: 2, xp: 0 },
          ],
          pointsTarget: 10,
          firstPlayerId: "ghost",
          winnerId: "a",
        },
        current,
      ) as ReturnType<NonNullable<typeof merge>>;
      expect(result.status).toBe("playing");
      expect(result.mode).toBe("ffa");
      expect(result.players[0]).toMatchObject({ points: 0, xp: 4 });
      expect(result.pointsTarget).toBe(10);
      expect(result.firstPlayerId).toBeNull();
      expect(result.winnerId).toBe("a");
    });

    it("restores a 2v2 and re-syncs teammates' shared score", () => {
      const current = useMatchTrackerStore.getState();
      const result = merge?.(
        {
          status: "playing",
          mode: "teams",
          players: [
            { id: "a", name: "A", points: 3, xp: 0, team: 0 },
            { id: "b", name: "B", points: 1, xp: 0, team: 0 },
            { id: "c", name: "C", points: 0, xp: 0, team: 1 },
            { id: "d", name: "D", points: 0, xp: 0, team: 1 },
          ],
        },
        current,
      ) as ReturnType<NonNullable<typeof merge>>;
      expect(result.mode).toBe("teams");
      expect(result.players.find((entry) => entry.id === "a")?.points).toBe(3);
      expect(result.players.find((entry) => entry.id === "b")?.points).toBe(3);
      expect(result.players.find((entry) => entry.id === "c")?.points).toBe(0);
    });

    it("drops teams when the persisted roster is not four players", () => {
      const current = useMatchTrackerStore.getState();
      const result = merge?.(
        {
          mode: "teams",
          players: [
            { id: "a", name: "A", points: 0, xp: 0, team: 0 },
            { id: "b", name: "B", points: 0, xp: 0, team: 1 },
          ],
        },
        current,
      ) as ReturnType<NonNullable<typeof merge>>;
      expect(result.mode).toBe("ffa");
    });

    it("coerces an unknown status to setup", () => {
      const current = useMatchTrackerStore.getState();
      const result = merge?.(
        {
          status: "bogus",
          players: [
            { id: "a", name: "A", points: 0, xp: 0 },
            { id: "b", name: "B", points: 0, xp: 0 },
          ],
        },
        current,
      );
      expect(result?.status).toBe("setup");
    });

    it("restores a seat's legend and drops one missing its identity", () => {
      const current = useMatchTrackerStore.getState();
      const result = merge?.(
        {
          players: [
            {
              id: "a",
              name: "A",
              points: 0,
              xp: 0,
              legend: {
                cardId: "c1",
                name: "Jinx",
                domains: ["fury", "body"],
                thumbnail: "/x.webp",
              },
            },
            { id: "b", name: "B", points: 0, xp: 0, legend: { name: "no card id" } },
          ],
        },
        current,
      );
      expect(result?.players[0]?.legend).toEqual({
        cardId: "c1",
        name: "Jinx",
        domains: ["fury", "body"],
        thumbnail: "/x.webp",
      });
      expect(result?.players[1]?.legend).toBeNull();
    });

    it("defaults xpOpen to false for a blob written before the rail existed", () => {
      const current = useMatchTrackerStore.getState();
      const result = merge?.(
        {
          players: [
            { id: "a", name: "A", points: 0, xp: 3 },
            { id: "b", name: "B", points: 0, xp: 0, xpOpen: true },
          ],
        },
        current,
      );
      expect(result?.players[0]?.xpOpen).toBe(false);
      expect(result?.players[1]?.xpOpen).toBe(true);
    });
  });

  describe("setLegend", () => {
    it("attaches a legend to one seat and survives starting a game", () => {
      const legend = {
        cardId: "c1",
        name: "Jinx",
        domains: ["fury"],
        thumbnail: null,
      };
      const [first, second] = useMatchTrackerStore.getState().players;
      useMatchTrackerStore.getState().setLegend(first!.id, legend);
      useMatchTrackerStore.getState().startGame();

      const players = useMatchTrackerStore.getState().players;
      expect(players[0]?.legend).toEqual(legend);
      expect(players[1]?.legend).toBeNull();
      expect(second).toBeDefined();
    });

    it("clears a legend when passed null", () => {
      const [first] = useMatchTrackerStore.getState().players;
      useMatchTrackerStore
        .getState()
        .setLegend(first!.id, { cardId: "c1", name: "Jinx", domains: [], thumbnail: null });
      useMatchTrackerStore.getState().setLegend(first!.id, null);
      expect(useMatchTrackerStore.getState().players[0]?.legend).toBeNull();
    });
  });

  describe("openXp", () => {
    it("opens the rail and counts the opening tap as the first point of XP", () => {
      useMatchTrackerStore.getState().startGame();
      const [first] = useMatchTrackerStore.getState().players;
      useMatchTrackerStore.getState().openXp(first!.id);

      expect(useMatchTrackerStore.getState().players[0]?.xpOpen).toBe(true);
      expect(useMatchTrackerStore.getState().players[0]?.xp).toBe(1);
    });

    it("leaves the other seats closed", () => {
      useMatchTrackerStore.getState().startGame();
      const [first] = useMatchTrackerStore.getState().players;
      useMatchTrackerStore.getState().openXp(first!.id);
      expect(useMatchTrackerStore.getState().players[1]?.xpOpen).toBe(false);
    });

    it("does nothing when the rail is already open", () => {
      useMatchTrackerStore.getState().startGame();
      const [first] = useMatchTrackerStore.getState().players;
      useMatchTrackerStore.getState().openXp(first!.id);
      useMatchTrackerStore.getState().openXp(first!.id);
      expect(useMatchTrackerStore.getState().players[0]?.xp).toBe(1);
    });

    it("closes every rail again on the next game", () => {
      useMatchTrackerStore.getState().startGame();
      const [first] = useMatchTrackerStore.getState().players;
      useMatchTrackerStore.getState().openXp(first!.id);
      useMatchTrackerStore.getState().startGame();
      expect(useMatchTrackerStore.getState().players[0]?.xpOpen).toBe(false);
    });
  });

  describe("setScore", () => {
    it("corrects a total outright", () => {
      useMatchTrackerStore.getState().startGame();
      const [first] = useMatchTrackerStore.getState().players;
      useMatchTrackerStore.getState().setScore(first!.id, 5);
      expect(useMatchTrackerStore.getState().players[0]?.points).toBe(5);
    });

    it("floors at zero and ignores a no-op", () => {
      useMatchTrackerStore.getState().startGame();
      const [first] = useMatchTrackerStore.getState().players;
      useMatchTrackerStore.getState().setScore(first!.id, -4);
      expect(useMatchTrackerStore.getState().players[0]?.points).toBe(0);
      expect(useMatchTrackerStore.getState().log).toHaveLength(0);
    });

    it("carries the whole team in a 2v2", () => {
      const roster = startTeamsGame();
      useMatchTrackerStore.getState().setScore(roster[0]!.id, 6);
      const players = useMatchTrackerStore.getState().players;
      expect(players[0]?.points).toBe(6);
      expect(players[1]?.points).toBe(6);
      expect(players[2]?.points).toBe(0);
    });

    it("declares a winner when the correction crosses the target", () => {
      useMatchTrackerStore.getState().startGame();
      const [first] = useMatchTrackerStore.getState().players;
      useMatchTrackerStore.getState().setScore(first!.id, 8);
      expect(useMatchTrackerStore.getState().status).toBe("finished");
      expect(useMatchTrackerStore.getState().winnerId).toBe(first!.id);
    });
  });

  describe("undoLast", () => {
    it("reverses the last scoring change", () => {
      useMatchTrackerStore.getState().startGame();
      const [first] = useMatchTrackerStore.getState().players;
      useMatchTrackerStore.getState().adjustPoints(first!.id, 1, "conquer");
      useMatchTrackerStore.getState().adjustPoints(first!.id, 1, "hold");
      useMatchTrackerStore.getState().undoLast();

      expect(useMatchTrackerStore.getState().players[0]?.points).toBe(1);
      expect(useMatchTrackerStore.getState().log).toHaveLength(1);
    });

    it("steps back through several changes", () => {
      useMatchTrackerStore.getState().startGame();
      const [first] = useMatchTrackerStore.getState().players;
      useMatchTrackerStore.getState().adjustPoints(first!.id, 1, "conquer");
      useMatchTrackerStore.getState().adjustPoints(first!.id, 1, "ability");
      useMatchTrackerStore.getState().undoLast();
      useMatchTrackerStore.getState().undoLast();

      expect(useMatchTrackerStore.getState().players[0]?.points).toBe(0);
      expect(useMatchTrackerStore.getState().log).toHaveLength(0);
    });

    it("puts a finished game back into play when the winning point is reversed", () => {
      useMatchTrackerStore.getState().startGame();
      const [first] = useMatchTrackerStore.getState().players;
      useMatchTrackerStore.getState().setScore(first!.id, 7);
      useMatchTrackerStore.getState().adjustPoints(first!.id, 1, "conquer");
      expect(useMatchTrackerStore.getState().status).toBe("finished");

      useMatchTrackerStore.getState().undoLast();

      expect(useMatchTrackerStore.getState().status).toBe("playing");
      expect(useMatchTrackerStore.getState().winnerId).toBeNull();
      expect(useMatchTrackerStore.getState().players[0]?.points).toBe(7);
    });

    it("restores a clamped change to the value it actually had", () => {
      useMatchTrackerStore.getState().startGame();
      const [first] = useMatchTrackerStore.getState().players;
      // Floors at 0 rather than going to -1, so a naive +1 reversal would be wrong.
      useMatchTrackerStore.getState().adjustPoints(first!.id, -1, "manual");
      useMatchTrackerStore.getState().undoLast();
      expect(useMatchTrackerStore.getState().players[0]?.points).toBe(0);
    });

    it("reverses both teammates in a 2v2", () => {
      const roster = startTeamsGame();
      useMatchTrackerStore.getState().adjustPoints(roster[0]!.id, 1, "conquer");
      useMatchTrackerStore.getState().undoLast();
      const players = useMatchTrackerStore.getState().players;
      expect(players[0]?.points).toBe(0);
      expect(players[1]?.points).toBe(0);
    });

    it("reverses an XP change too", () => {
      useMatchTrackerStore.getState().startGame();
      const [first] = useMatchTrackerStore.getState().players;
      useMatchTrackerStore.getState().adjustXp(first!.id, 3);
      useMatchTrackerStore.getState().undoLast();
      expect(useMatchTrackerStore.getState().players[0]?.xp).toBe(0);
    });

    it("does nothing on an empty log", () => {
      useMatchTrackerStore.getState().startGame();
      useMatchTrackerStore.getState().undoLast();
      expect(useMatchTrackerStore.getState().players[0]?.points).toBe(0);
    });

    it("starts a fresh log on a new game", () => {
      useMatchTrackerStore.getState().startGame();
      const [first] = useMatchTrackerStore.getState().players;
      useMatchTrackerStore.getState().adjustPoints(first!.id, 1, "conquer");
      useMatchTrackerStore.getState().startGame();
      expect(useMatchTrackerStore.getState().log).toHaveLength(0);
    });

    it("keeps the log bounded", () => {
      useMatchTrackerStore.getState().startGame();
      const [first] = useMatchTrackerStore.getState().players;
      for (let index = 0; index < 40; index += 1) {
        useMatchTrackerStore.getState().adjustXp(first!.id, 1);
      }
      expect(useMatchTrackerStore.getState().log.length).toBeLessThanOrEqual(30);
    });
  });
});

describe("describeAction", () => {
  it("returns null when there is nothing to undo", () => {
    expect(describeAction(undefined, [])).toBeNull();
  });

  it("names the player and the scoring route", () => {
    useMatchTrackerStore.getState().startGame();
    const [first] = useMatchTrackerStore.getState().players;
    useMatchTrackerStore.getState().adjustPoints(first!.id, 1, "conquer");
    const { log, players } = useMatchTrackerStore.getState();
    expect(describeAction(log.at(-1), players)).toBe(`Undo ${first!.name}'s Conquer`);
  });

  it("distinguishes a correction and an XP change from a scored point", () => {
    useMatchTrackerStore.getState().startGame();
    const [first] = useMatchTrackerStore.getState().players;

    useMatchTrackerStore.getState().setScore(first!.id, 4);
    let state = useMatchTrackerStore.getState();
    expect(describeAction(state.log.at(-1), state.players)).toBe(
      `Undo ${first!.name}'s score correction`,
    );

    useMatchTrackerStore.getState().adjustXp(first!.id, 1);
    state = useMatchTrackerStore.getState();
    expect(describeAction(state.log.at(-1), state.players)).toBe(`Undo ${first!.name}'s XP change`);
  });
});

describe("isMatchPoint", () => {
  it("is true exactly one point short of the target", () => {
    expect(isMatchPoint(player("a", 0, 7), 8)).toBe(true);
    expect(isMatchPoint(player("a", 0, 6), 8)).toBe(false);
    expect(isMatchPoint(player("a", 0, 8), 8)).toBe(false);
  });
});
