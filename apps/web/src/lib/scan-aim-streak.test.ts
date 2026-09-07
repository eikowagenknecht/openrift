import { describe, expect, it } from "vitest";

import { AIM_STREAK_GAP_MS, createAimStreaks } from "./scan-aim-streak";

describe("createAimStreaks", () => {
  it("starts a streak at zero seconds", () => {
    expect(createAimStreaks().touch("art-a", 1000)).toBe(0);
  });

  it("ages a streak the caller keeps touching", () => {
    const streaks = createAimStreaks();
    streaks.touch("art-a", 1000);
    streaks.touch("art-a", 1500);
    expect(streaks.touch("art-a", 3000)).toBe(2);
  });

  it("restarts a streak dropped for longer than the gap", () => {
    const streaks = createAimStreaks();
    streaks.touch("art-a", 1000);
    expect(streaks.touch("art-a", 1000 + AIM_STREAK_GAP_MS + 1)).toBe(0);
  });

  it("keeps a streak alive across a gap short enough to be a missed frame", () => {
    const streaks = createAimStreaks();
    streaks.touch("art-a", 1000);
    expect(streaks.touch("art-a", 1000 + AIM_STREAK_GAP_MS)).toBe(AIM_STREAK_GAP_MS / 1000);
  });

  it("tracks each artwork on its own clock", () => {
    const streaks = createAimStreaks();
    streaks.touch("art-a", 1000);
    streaks.touch("art-b", 2000);
    expect(streaks.touch("art-a", 3000)).toBe(2);
    expect(streaks.touch("art-b", 3000)).toBe(1);
  });

  it("reports the age on take and forgets the streak", () => {
    const streaks = createAimStreaks();
    streaks.touch("art-a", 1000);
    expect(streaks.take("art-a", 2500)).toBe(1.5);
    expect(streaks.take("art-a", 2500)).toBeNull();
  });

  it("has nothing to take for an artwork never aimed at", () => {
    expect(createAimStreaks().take("art-a", 1000)).toBeNull();
  });

  it("forgets every streak on clear", () => {
    const streaks = createAimStreaks();
    streaks.touch("art-a", 1000);
    streaks.clear();
    expect(streaks.touch("art-a", 3000)).toBe(0);
  });

  it("takes the gap from the caller", () => {
    const streaks = createAimStreaks(500);
    streaks.touch("art-a", 1000);
    expect(streaks.touch("art-a", 1600)).toBe(0);
  });
});
