import { describe, expect, it } from "vitest";

import { pickAutoBye } from "./auto-bye";
import type { PairingPlayer } from "./types";

function player(id: string, overrides: Partial<PairingPlayer> = {}): PairingPlayer {
  return { id, score: 0, pods3: 0, pods4: 0, byes: 0, opponents: new Map(), ...overrides };
}

describe("pickAutoBye", () => {
  it("picks the lowest-scoring player when nobody has byed", () => {
    const players = [
      player("a", { score: 9 }),
      player("b", { score: 3 }),
      player("c", { score: 6 }),
    ];
    expect(pickAutoBye(players)).toBe("b");
  });

  it("prefers fewest byes over lower score", () => {
    const players = [player("a", { score: 0, byes: 1 }), player("b", { score: 9, byes: 0 })];
    expect(pickAutoBye(players)).toBe("b");
  });

  it("breaks a full tie deterministically by id", () => {
    const players = [player("z"), player("m"), player("a")];
    expect(pickAutoBye(players)).toBe("a");
    expect(pickAutoBye(players.toReversed())).toBe("a");
  });

  it("handles a single player", () => {
    expect(pickAutoBye([player("only", { byes: 2, score: 12 })])).toBe("only");
  });

  it("throws on an empty field", () => {
    expect(() => pickAutoBye([])).toThrow();
  });
});
