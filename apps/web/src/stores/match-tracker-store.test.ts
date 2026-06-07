import type { PackRandom as Random } from "@openrift/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import { defaultTargetForPlayerCount, useMatchTrackerStore } from "./match-tracker-store";

let resetStore: () => void;

// A deterministic RNG that yields the given values in order, then repeats the last.
function fixedRandom(...values: number[]): Random {
  let index = 0;
  return {
    next: () => values[Math.min(index++, values.length - 1)] ?? 0,
  };
}

beforeEach(() => {
  resetStore = createStoreResetter(useMatchTrackerStore);
});

afterEach(() => {
  resetStore();
});

describe("defaultTargetForPlayerCount", () => {
  it("is 8 for a duel and 11 for three or more players", () => {
    expect(defaultTargetForPlayerCount(2)).toBe(8);
    expect(defaultTargetForPlayerCount(3)).toBe(11);
    expect(defaultTargetForPlayerCount(4)).toBe(11);
  });
});

describe("useMatchTrackerStore", () => {
  it("starts in setup with two default players", () => {
    const state = useMatchTrackerStore.getState();
    expect(state.status).toBe("setup");
    expect(state.players).toHaveLength(2);
    expect(state.players.map((player) => player.name)).toEqual(["Player 1", "Player 2"]);
    expect(state.pointsTarget).toBe(8);
    expect(state.firstPlayerId).toBeNull();
    expect(state.winnerId).toBeNull();
  });

  describe("setPlayerCount", () => {
    it("grows the roster and bumps the default target", () => {
      useMatchTrackerStore.getState().setPlayerCount(4);
      const state = useMatchTrackerStore.getState();
      expect(state.players).toHaveLength(4);
      expect(state.players[3]?.name).toBe("Player 4");
      expect(state.pointsTarget).toBe(11);
    });

    it("trims the roster from the end and resets the target", () => {
      useMatchTrackerStore.getState().setPlayerCount(4);
      useMatchTrackerStore.getState().setPlayerCount(2);
      const state = useMatchTrackerStore.getState();
      expect(state.players).toHaveLength(2);
      expect(state.pointsTarget).toBe(8);
    });

    it("clamps below the minimum and above the maximum", () => {
      useMatchTrackerStore.getState().setPlayerCount(1);
      expect(useMatchTrackerStore.getState().players).toHaveLength(2);
      useMatchTrackerStore.getState().setPlayerCount(9);
      expect(useMatchTrackerStore.getState().players).toHaveLength(4);
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
      expect(state.players.every((player) => player.points === 0 && player.xp === 0)).toBe(true);
      expect(state.winnerId).toBeNull();
      expect(state.firstPlayerId).toBeNull();
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
  });

  describe("adjustXp", () => {
    it("accumulates with no cap and floors at zero", () => {
      const [first] = useMatchTrackerStore.getState().players;
      useMatchTrackerStore.getState().adjustXp(first!.id, 100);
      expect(useMatchTrackerStore.getState().players[0]?.xp).toBe(100);
      useMatchTrackerStore.getState().adjustXp(first!.id, -1000);
      expect(useMatchTrackerStore.getState().players[0]?.xp).toBe(0);
    });
  });

  describe("pickFirstPlayer", () => {
    it("selects a player by the injected RNG", () => {
      useMatchTrackerStore.getState().setPlayerCount(4);
      const players = useMatchTrackerStore.getState().players;
      // 0.5 * 4 = 2 -> index 2
      useMatchTrackerStore.getState().pickFirstPlayer(fixedRandom(0.5));
      expect(useMatchTrackerStore.getState().firstPlayerId).toBe(players[2]?.id);
    });

    it("clamps when the RNG returns its upper bound", () => {
      const players = useMatchTrackerStore.getState().players;
      useMatchTrackerStore.getState().pickFirstPlayer(fixedRandom(0.999_999));
      expect(useMatchTrackerStore.getState().firstPlayerId).toBe(players.at(-1)?.id);
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
      expect(result.players[0]).toMatchObject({ points: 0, xp: 4 });
      expect(result.pointsTarget).toBe(10);
      expect(result.firstPlayerId).toBeNull();
      expect(result.winnerId).toBe("a");
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
  });
});
