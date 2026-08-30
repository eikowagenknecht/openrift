import { describe, expect, it } from "vitest";

import type { MetaAutoAcceptCandidate, MetaAutoAcceptSettings } from "./meta-auto-accept.js";
import { autoAcceptRule } from "./meta-auto-accept.js";

const OFF: MetaAutoAcceptSettings = {
  autoAcceptMinPlayers: null,
  autoAcceptNotable: false,
  autoAcceptOfficial: false,
};

function candidate(overrides: Partial<MetaAutoAcceptCandidate> = {}): MetaAutoAcceptCandidate {
  return {
    name: "Friday Night Riftbound",
    playerCount: 12,
    isOfficial: false,
    formatMapped: true,
    ...overrides,
  };
}

describe("autoAcceptRule", () => {
  it("accepts nothing while every rule is off", () => {
    expect(autoAcceptRule(OFF, candidate({ name: "Worlds", playerCount: 900 }))).toBeNull();
  });

  it("matches on the player-count threshold", () => {
    const settings = { ...OFF, autoAcceptMinPlayers: 64 };

    expect(autoAcceptRule(settings, candidate({ playerCount: 64 }))).toBe("player-count");
    expect(autoAcceptRule(settings, candidate({ playerCount: 63 }))).toBeNull();
    expect(autoAcceptRule(settings, candidate({ playerCount: null }))).toBeNull();
  });

  it("matches on the notable vocabulary", () => {
    expect(
      autoAcceptRule({ ...OFF, autoAcceptNotable: true }, candidate({ name: "EU Regional" })),
    ).toBe("notable-name");
  });

  it("matches a watched template only while the toggle is on, whatever the name says", () => {
    const official = candidate({ name: "Saturday Showdown", isOfficial: true });

    expect(autoAcceptRule({ ...OFF, autoAcceptOfficial: true }, official)).toBe(
      "official-template",
    );
    expect(autoAcceptRule(OFF, official)).toBeNull();
  });

  it("leaves an event on an unwatched template in the human queue", () => {
    const settings = { ...OFF, autoAcceptOfficial: true };

    expect(autoAcceptRule(settings, candidate({ isOfficial: false }))).toBeNull();
  });

  it("reports the official template ahead of the weaker signals it also matches", () => {
    const settings = {
      autoAcceptMinPlayers: 8,
      autoAcceptNotable: true,
      autoAcceptOfficial: true,
    };

    expect(
      autoAcceptRule(
        settings,
        candidate({
          name: "EU Regional",
          playerCount: 128,
          isOfficial: true,
        }),
      ),
    ).toBe("official-template");
  });

  it("refuses an event whose format maps to nothing, however well it scores", () => {
    const settings = {
      autoAcceptMinPlayers: 8,
      autoAcceptNotable: true,
      autoAcceptOfficial: true,
    };

    expect(
      autoAcceptRule(
        settings,
        candidate({
          name: "Worlds",
          playerCount: 900,
          isOfficial: true,
          formatMapped: false,
        }),
      ),
    ).toBeNull();
  });
});
